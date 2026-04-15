import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const API_BASE = "https://api.portaldatransparencia.gov.br/api-de-dados";

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

/** Convert DD/MM/YYYY to YYYY-MM-DD, return null on bad input */
function parseDateBR(d: string | null | undefined): string | null {
  if (!d) return null;
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // Already ISO?
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  return null;
}

async function ingestCadastro(
  supabase: any,
  apiKey: string,
  tipo: "ceis" | "cnep",
): Promise<{ total: number; errors: string[] }> {
  let pagina = 1;
  let total = 0;
  const errors: string[] = [];
  const endpoint = tipo === "ceis" ? "ceis" : "cnep";

  while (true) {
    try {
      const url = `${API_BASE}/${endpoint}?pagina=${pagina}`;
      console.log(`Fetching ${tipo.toUpperCase()} page ${pagina}`);
      const resp = await fetchWithRetry(url, apiKey);

      if (!resp.ok) {
        const txt = await resp.text();
        errors.push(`${tipo} p${pagina}: HTTP ${resp.status} - ${txt.slice(0, 100)}`);
        break;
      }

      const items = await resp.json();
      if (!Array.isArray(items) || items.length === 0) break;

      const rows = items.map((item: any) => ({
        id_origem: String(item.id || item.codigoSancao || `${tipo}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
        cnpj_cpf: (item.cpfCnpj || item.sancionado?.cpfCnpj || "").replace(/[.\-\/]/g, "") || null,
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
      }));

      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { error } = await supabase
          .from("empresas_sancionadas")
          .upsert(batch, { onConflict: "id_origem,tipo_cadastro" });
        if (error) errors.push(`${tipo} p${pagina}: ${error.message}`);
        else total += batch.length;
      }

      if (items.length < 500) break; // Last page
      pagina++;
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      errors.push(`${tipo} p${pagina}: ${e instanceof Error ? e.message : "unknown"}`);
      break;
    }
  }

  return { total, errors };
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
  const tipo = body.tipo || "both"; // "ceis", "cnep", or "both"

  try {
    const results: Record<string, any> = {};

    if (tipo === "ceis" || tipo === "both") {
      results.ceis = await ingestCadastro(supabase, apiKey, "ceis");
    }
    if (tipo === "cnep" || tipo === "both") {
      results.cnep = await ingestCadastro(supabase, apiKey, "cnep");
    }

    const totalProcessed = (results.ceis?.total || 0) + (results.cnep?.total || 0);
    const allErrors = [...(results.ceis?.errors || []), ...(results.cnep?.errors || [])];

    await supabase.from("ingestao_logs").insert({
      fonte: "PORTAL_TRANSPARENCIA",
      endpoint: `ceis-cnep/${tipo}`,
      status: allErrors.length > 0 ? "parcial" : "sucesso",
      registros_processados: totalProcessed,
      erro: allErrors.length > 0 ? allErrors.join("; ").slice(0, 1000) : null,
    });

    return new Response(
      JSON.stringify({ success: true, totalProcessed, results }),
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
