import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const API_BASE = "https://api.portaldatransparencia.gov.br/api-de-dados";
const MAX_PAGES = 100;
const WINDOW_MONTHS = 6;
const START_DATES: Record<string, string> = { ceis: "2020-01-01", cnep: "2020-01-01" };

async function fetchWithRetry(url: string, apiKey: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      const resp = await fetch(url, {
        headers: { Accept: "application/json", "chave-api-dados": apiKey },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (resp.status === 429) {
        await new Promise(r => setTimeout(r, 3000 * Math.pow(2, i)));
        continue;
      }
      return resp;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error("Max retries");
}

function parseDateBR(d: string | null | undefined): string | null {
  if (!d) return null;
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  return null;
}

function toDateBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function addMonths(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function mapItem(item: any, tipo: string) {
  return {
    id_origem: String(item.id || `${tipo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    cnpj_cpf: ((item.cpfCnpjSancionado || item.sancionado?.codigoFormatado || item.sancionado?.cpfCnpj || "").replace(/[.\-\/]/g, "")) || null,
    nome: item.sancionado?.nome || item.nomeFantasia || item.razaoSocial || "Não informado",
    tipo_cadastro: tipo.toUpperCase(),
    tipo_sancao: item.tipoSancao?.descricaoResumida || item.tipoSancao?.descricao || null,
    orgao_sancionador: item.orgaoSancionador?.nome || null,
    uf_orgao: item.orgaoSancionador?.siglaUf || null,
    data_inicio: parseDateBR(item.dataInicioSancao),
    data_fim: parseDateBR(item.dataFimSancao),
    fundamentacao_legal: item.fundamentacaoLegal || item.fundamentacao?.descricao || null,
    fonte: "PORTAL_TRANSPARENCIA",
    raw_json: item,
  };
}

async function authenticateAdmin(req: Request): Promise<{ userId: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "").trim();

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (serviceKey && token === serviceKey) {
    return { userId: "internal-pipeline" };
  }

  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "",
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data, error } = await supabaseAuth.auth.getClaims(token);
  if (error || !data?.claims) return null;

  const userId = data.claims.sub as string;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: roles } = await supabase
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin_central").limit(1);

  if (!roles?.length) return null;
  return { userId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth + admin check
  const auth = await authenticateAdmin(req);
  if (!auth) {
    return new Response(JSON.stringify({ error: "Não autorizado. Acesso restrito a administradores." }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const apiKey = Deno.env.get("PORTAL_TRANSPARENCIA_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "PORTAL_TRANSPARENCIA_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));
  const tipo: string = body.tipo || "ceis";
  const syncKey = `sancionadas_${tipo}`;

  try {
    const { data: syncRow } = await supabase
      .from("sync_status")
      .select("*")
      .eq("api_source", syncKey)
      .maybeSingle();

    let windowStart: string;
    if (syncRow) {
      windowStart = addMonths(syncRow.last_date_processed, 0);
    } else {
      windowStart = START_DATES[tipo] || "2003-01-01";
    }

    const windowEnd = (() => {
      const end = addMonths(windowStart, WINDOW_MONTHS);
      const t = today();
      return end > t ? t : end;
    })();

    const isComplete = windowStart >= today();
    if (isComplete) {
      console.log(`${tipo.toUpperCase()} ingestion complete - up to date`);
      return new Response(JSON.stringify({ tipo, status: "complete", message: "All data ingested up to today" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`${tipo.toUpperCase()} ingesting window: ${windowStart} → ${windowEnd}`);

    let total = 0;
    const errors: string[] = [];
    let pagina = 1;
    let exhausted = false;

    while (pagina <= MAX_PAGES) {
      try {
        const url = `${API_BASE}/${tipo}?dataInicial=${encodeURIComponent(toDateBR(windowStart))}&dataFinal=${encodeURIComponent(toDateBR(windowEnd))}&pagina=${pagina}`;
        console.log(`  p${pagina}...`);
        const resp = await fetchWithRetry(url, apiKey);

        if (!resp.ok) {
          if (resp.status === 404 || resp.status === 400) { exhausted = true; break; }
          errors.push(`p${pagina}: HTTP ${resp.status}`);
          break;
        }

        const items = await resp.json();
        if (!Array.isArray(items) || items.length === 0) { exhausted = true; break; }

        const rows = items.map((item: any) => mapItem(item, tipo));
        for (let i = 0; i < rows.length; i += 100) {
          const batch = rows.slice(i, i + 100);
          const { error } = await supabase
            .from("empresas_sancionadas")
            .upsert(batch, { onConflict: "id_origem,tipo_cadastro" });
          if (error) errors.push(`p${pagina}: ${error.message}`);
          else total += batch.length;
        }

        if (items.length < 15) { exhausted = true; break; }
        pagina++;
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        errors.push(`p${pagina}: ${e instanceof Error ? e.message : "unknown"}`);
        break;
      }
    }

    const nextStart = exhausted ? windowEnd : windowStart;
    if (syncRow) {
      await supabase.from("sync_status")
        .update({ last_date_processed: nextStart, total_synced: (syncRow.total_synced || 0) + total, updated_at: new Date().toISOString() })
        .eq("id", syncRow.id);
    } else {
      await supabase.from("sync_status").insert({
        api_source: syncKey,
        modalidade: tipo === "ceis" ? 901 : 902,
        last_date_processed: nextStart,
        total_synced: total,
      });
    }

    await supabase.from("ingestao_logs").insert({
      fonte: "PORTAL_TRANSPARENCIA",
      endpoint: `${tipo.toUpperCase()}/${windowStart}→${windowEnd}`,
      status: errors.length > 0 ? "parcial" : "sucesso",
      registros_processados: total,
      erro: errors.length > 0 ? errors.join("; ").slice(0, 1000) : null,
    });

    const done = exhausted && windowEnd >= today();
    console.log(`${tipo.toUpperCase()} window done: ${total} records, exhausted=${exhausted}, allDone=${done}`);

    return new Response(JSON.stringify({
      tipo, window: `${windowStart} → ${windowEnd}`, totalProcessed: total,
      windowExhausted: exhausted, allDone: done, nextWindow: done ? null : nextStart,
      errors: errors.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Fatal error:", error);
    return new Response(JSON.stringify({ error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
