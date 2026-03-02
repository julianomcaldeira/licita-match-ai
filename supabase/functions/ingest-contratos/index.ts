import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://api.portaldatransparencia.gov.br/api-de-dados";
const PAGE_SIZE = 500; // max allowed by the API

interface ContratoAPI {
  id?: number;
  dataInicioVigencia?: string;
  dataFimVigencia?: string;
  dataAssinatura?: string;
  dataPublicacao?: string;
  numero?: string;
  objeto?: string;
  situacao?: string;
  valorInicial?: number;
  valorFinal?: number;
  categoria?: string;
  modalidadeCompra?: string;
  numeroProcesso?: string;
  licitacaoAssociada?: string;
  unidadeGestora?: {
    codigo?: string;
    nome?: string;
    orgaoVinculado?: {
      cnpj?: string;
      nome?: string;
      sigla?: string;
    };
    orgaoMaximo?: {
      codigo?: string;
      nome?: string;
    };
  };
  fornecedor?: {
    nome?: string;
    cnpjFormatado?: string;
    cnpjCpf?: string;
    tipo?: string;
  };
  [key: string]: unknown;
}

function fmtDateBR(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

async function fetchWithRetry(url: string, apiKey: string, retries = 3, delayMs = 2000): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, {
        headers: {
          Accept: "application/json",
          "chave-api-dados": apiKey,
        },
      });
      if (resp.status === 429) {
        const wait = delayMs * Math.pow(2, i);
        console.log(`Rate limited, waiting ${wait}ms...`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      return resp;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("Max retries reached");
}

function mapContrato(c: ContratoAPI) {
  const cnpjOrgao = c.unidadeGestora?.orgaoVinculado?.cnpj || c.unidadeGestora?.codigo || "desconhecido";
  const numero = c.numero || `pt-${c.id || Date.now()}`;

  return {
    cnpj_orgao: cnpjOrgao.replace(/[.\-\/]/g, ""),
    numero_contrato: numero,
    orgao_nome: c.unidadeGestora?.orgaoVinculado?.nome || c.unidadeGestora?.orgaoMaximo?.nome || null,
    orgao_codigo: c.unidadeGestora?.codigo || null,
    fornecedor_nome: c.fornecedor?.nome || null,
    fornecedor_cnpj: c.fornecedor?.cnpjCpf?.replace(/[.\-\/]/g, "") || null,
    objeto: c.objeto || "Sem descrição",
    valor_inicial: c.valorInicial || null,
    valor_final: c.valorFinal || null,
    data_assinatura: c.dataAssinatura || null,
    data_vigencia_inicio: c.dataInicioVigencia || null,
    data_vigencia_fim: c.dataFimVigencia || null,
    data_publicacao: c.dataPublicacao || null,
    situacao: c.situacao || null,
    categoria: c.categoria || null,
    modalidade_compra: c.modalidadeCompra || null,
    numero_licitacao: c.licitacaoAssociada || c.numeroProcesso || null,
    raw_json: c as unknown as Record<string, unknown>,
    fonte: "PORTAL_TRANSPARENCIA",
  };
}

/**
 * Fetch contracts for a date range, paginating through all pages
 */
async function fetchContratos(
  supabase: any,
  apiKey: string,
  dataInicial: string, // DD/MM/YYYY
  dataFinal: string,   // DD/MM/YYYY
): Promise<{ total: number; errors: string[] }> {
  let pagina = 1;
  let hasMore = true;
  let total = 0;
  const errors: string[] = [];

  while (hasMore) {
    try {
      const url = `${API_BASE}/contratos?dataInicial=${encodeURIComponent(dataInicial)}&dataFinal=${encodeURIComponent(dataFinal)}&pagina=${pagina}`;
      console.log(`Fetching: ${url}`);

      const response = await fetchWithRetry(url, apiKey);

      if (!response.ok) {
        const errText = await response.text();
        errors.push(`Page ${pagina}: HTTP ${response.status} - ${errText.slice(0, 200)}`);
        hasMore = false;
        continue;
      }

      const contratos: ContratoAPI[] = await response.json();

      if (!Array.isArray(contratos) || contratos.length === 0) {
        hasMore = false;
        continue;
      }

      const rows = contratos.map(mapContrato);

      // Upsert in batches of 50
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        const { error } = await supabase
          .from("contratos")
          .upsert(batch, { onConflict: "cnpj_orgao,numero_contrato" });
        if (error) {
          errors.push(`Page ${pagina} batch ${i}: ${error.message}`);
        } else {
          total += batch.length;
        }
      }

      hasMore = contratos.length >= PAGE_SIZE;
      pagina++;

      // Small delay to respect rate limits
      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      errors.push(`Page ${pagina}: ${e instanceof Error ? e.message : "unknown"}`);
      hasMore = false;
    }
  }

  return { total, errors };
}

/**
 * Try to link contratos to existing licitacoes by matching fornecedor CNPJ + orgao
 */
async function linkToLicitacoes(supabase: any): Promise<number> {
  const { data, error } = await supabase.rpc("link_contratos_licitacoes");
  if (error) {
    console.warn("Error linking contratos:", error.message);
    return 0;
  }
  return data || 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const apiKey = Deno.env.get("PORTAL_TRANSPARENCIA_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ success: false, error: "PORTAL_TRANSPARENCIA_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const body = await req.json().catch(() => ({}));
  const mode = body.mode || "ingest";

  try {
    if (mode === "cron") {
      // Daily incremental: yesterday's contracts
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dataInicial = fmtDateBR(yesterday);
      const dataFinal = fmtDateBR(yesterday);

      console.log(`Cron: fetching contratos for ${dataInicial}`);
      const result = await fetchContratos(supabase, apiKey, dataInicial, dataFinal);

      await supabase.from("ingestao_logs").insert({
        fonte: "PORTAL_TRANSPARENCIA",
        endpoint: "contratos-cron",
        status: result.errors.length > 0 ? "parcial" : "sucesso",
        registros_processados: result.total,
        data_inicio: yesterday.toISOString().split("T")[0],
        data_fim: yesterday.toISOString().split("T")[0],
        erro: result.errors.length > 0 ? result.errors.join("; ").slice(0, 1000) : null,
      });

      return new Response(
        JSON.stringify({ success: true, totalProcessed: result.total, errors: result.errors.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Manual ingest with date range
    const dataInicial = body.dataInicial; // DD/MM/YYYY
    const dataFinal = body.dataFinal;     // DD/MM/YYYY

    if (!dataInicial || !dataFinal) {
      return new Response(
        JSON.stringify({ success: false, error: "dataInicial and dataFinal required (DD/MM/YYYY)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Manual ingest: ${dataInicial} → ${dataFinal}`);
    const result = await fetchContratos(supabase, apiKey, dataInicial, dataFinal);

    await supabase.from("ingestao_logs").insert({
      fonte: "PORTAL_TRANSPARENCIA",
      endpoint: "contratos-manual",
      status: result.errors.length > 0 ? "parcial" : "sucesso",
      registros_processados: result.total,
      data_inicio: dataInicial,
      data_fim: dataFinal,
      erro: result.errors.length > 0 ? result.errors.join("; ").slice(0, 1000) : null,
    });

    return new Response(
      JSON.stringify({ success: true, totalProcessed: result.total, errors: result.errors.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
