import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const API_BASE = "https://api.portaldatransparencia.gov.br/api-de-dados";
const MAX_PAGES_PER_RUN = 80; // Stay under Edge Function timeout

async function fetchWithRetry(url: string, apiKey: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const resp = await fetch(url, {
        headers: { Accept: "application/json", "chave-api-dados": apiKey },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (resp.status === 429) {
        await new Promise(r => setTimeout(r, 2000 * Math.pow(2, i)));
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

function fmtDateBR(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function mapItem(item: any, tipo: string) {
  return {
    id_origem: String(item.id || `${tipo}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
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

/**
 * Single-window ingestion: fetches one date range for one cadastro type.
 * Returns early if we hit MAX_PAGES_PER_RUN to avoid timeouts.
 */
async function ingestWindow(
  supabase: any, apiKey: string, tipo: string,
  dataInicial: string, dataFinal: string,
): Promise<{ total: number; errors: string[]; exhausted: boolean }> {
  let total = 0;
  const errors: string[] = [];
  let pagina = 1;

  while (pagina <= MAX_PAGES_PER_RUN) {
    try {
      const url = `${API_BASE}/${tipo}?dataInicial=${encodeURIComponent(dataInicial)}&dataFinal=${encodeURIComponent(dataFinal)}&pagina=${pagina}`;
      console.log(`${tipo.toUpperCase()} ${dataInicial}-${dataFinal} p${pagina}`);
      const resp = await fetchWithRetry(url, apiKey);

      if (!resp.ok) {
        const txt = await resp.text();
        if (resp.status === 404 || resp.status === 400) break;
        errors.push(`p${pagina}: HTTP ${resp.status}`);
        break;
      }

      const items = await resp.json();
      if (!Array.isArray(items) || items.length === 0) return { total, errors, exhausted: true };

      const rows = items.map((item: any) => mapItem(item, tipo));
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { error } = await supabase
          .from("empresas_sancionadas")
          .upsert(batch, { onConflict: "id_origem,tipo_cadastro" });
        if (error) errors.push(`p${pagina}: ${error.message}`);
        else total += batch.length;
      }

      if (items.length < 15) return { total, errors, exhausted: true };
      pagina++;
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      errors.push(`p${pagina}: ${e instanceof Error ? e.message : "unknown"}`);
      break;
    }
  }

  return { total, errors, exhausted: pagina <= MAX_PAGES_PER_RUN };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const apiKey = Deno.env.get("PORTAL_TRANSPARENCIA_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "PORTAL_TRANSPARENCIA_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({}));
  const tipo: string = body.tipo || "ceis"; // "ceis" or "cnep"
  // Date range in DD/MM/YYYY format
  const dataInicial: string = body.dataInicial || fmtDateBR((() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d; })());
  const dataFinal: string = body.dataFinal || fmtDateBR(new Date());

  try {
    const result = await ingestWindow(supabase, apiKey, tipo, dataInicial, dataFinal);

    await supabase.from("ingestao_logs").insert({
      fonte: "PORTAL_TRANSPARENCIA",
      endpoint: `${tipo}/${dataInicial}-${dataFinal}`,
      status: result.errors.length > 0 ? "parcial" : "sucesso",
      registros_processados: result.total,
      data_inicio: dataInicial,
      data_fim: dataFinal,
      erro: result.errors.length > 0 ? result.errors.join("; ").slice(0, 1000) : null,
    });

    return new Response(
      JSON.stringify({
        success: true,
        tipo,
        window: `${dataInicial} → ${dataFinal}`,
        totalProcessed: result.total,
        exhausted: result.exhausted,
        errors: result.errors.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno na ingestão CEIS/CNEP" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
