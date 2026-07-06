import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const API_BASE = "https://api.portaldatransparencia.gov.br/api-de-dados";

async function fetchWithRetry(url: string, apiKey: string, retries = 3, delayMs = 2000): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const resp = await fetch(url, {
      headers: { Accept: "application/json", "chave-api-dados": apiKey },
    });
    if (resp.status === 429) {
      const wait = delayMs * Math.pow(2, i);
      console.log(`Rate limited, waiting ${wait}ms...`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    return resp;
  }
  throw new Error("Max retries reached");
}

function digitsOnly(s: string | null | undefined): string {
  return (s || "").replace(/\D/g, "");
}

function normalizeContrato(s: string | null | undefined): string {
  // remove separadores comuns; contratos podem vir como "12/2024", "0000012/2024", etc.
  return digitsOnly(s || "");
}

/**
 * Extrai valores de empenho de um item retornado pelo Portal da Transparência.
 * A API tem duas formas comuns: "documentosDespesa" (fase Empenho/Liquidação/Pagamento) e
 * o endpoint /despesas/documentos/{id}. Aqui trabalhamos defensivamente porque campos variam.
 */
function extractEmpenhoRow(item: any, cnpjOrgao: string, codigoSiafi: string) {
  const numeroEmpenho =
    item.numeroEmpenho || item.nrEmpenho || item.codigo || item.documento || item.documentoResumido;
  const documento =
    item.documento || item.documentoResumido || item.numeroDocumento || null;
  const dataEmissao =
    item.dataEmissao || item.dtEmissao || item.data || null;
  const valorEmpenhado =
    item.valorDocumento ?? item.valor ?? item.valorEmpenhado ?? item.valorEmpenho ?? null;
  const valorLiquidado =
    item.valorLiquidado ?? item.valorLiquidadoDocumento ?? null;
  const valorPago =
    item.valorPago ?? item.valorPagoDocumento ?? null;
  const favorecido = item.favorecido || item.credor || {};
  const fornecedorCnpj = favorecido.cnpj || favorecido.codigo || favorecido.cpfFormatado || null;
  const fornecedorNome = favorecido.nome || favorecido.razaoSocial || null;
  const observacao = item.observacao || item.especie || item.fase || null;

  return {
    numero_empenho: String(numeroEmpenho || "").trim(),
    numero_documento: documento ? String(documento).trim() : null,
    data_emissao: dataEmissao ? (String(dataEmissao).includes("/")
      ? (() => { const [d, m, y] = String(dataEmissao).split("/"); return `${y}-${m}-${d}`; })()
      : String(dataEmissao).split("T")[0]) : null,
    valor_empenhado: valorEmpenhado != null ? Number(valorEmpenhado) : null,
    valor_liquidado: valorLiquidado != null ? Number(valorLiquidado) : null,
    valor_pago: valorPago != null ? Number(valorPago) : null,
    fornecedor_cnpj: fornecedorCnpj ? String(fornecedorCnpj) : null,
    fornecedor_nome: fornecedorNome,
    observacao,
    cnpj_orgao: cnpjOrgao,
    codigo_siafi_orgao: codigoSiafi,
    fonte: "PORTAL_TRANSPARENCIA",
    raw_json: item,
  };
}

/**
 * Busca empenhos federais por órgão (SIAFI) numa janela de data e faz o cruzamento
 * com contratos já cadastrados (match por cnpj_orgao + numero_documento ~ numero_contrato).
 */
async function ingestForContrato(
  supabase: any,
  apiKey: string,
  contrato: {
    contrato_id: string;
    cnpj_orgao: string;
    numero_contrato: string;
    codigo_siafi: string;
    licitacao_id: string | null;
    fornecedor_cnpj: string | null;
    data_assinatura: string | null;
  },
): Promise<{ inserted: number; errors: string[] }> {
  const errors: string[] = [];
  let inserted = 0;

  // Janela: da assinatura do contrato até hoje (limite 24 meses p/ controlar volume)
  const startDate = contrato.data_assinatura
    ? new Date(contrato.data_assinatura)
    : new Date(Date.now() - 365 * 24 * 3600 * 1000);
  const twoYearsAgo = new Date(Date.now() - 730 * 24 * 3600 * 1000);
  const from = startDate < twoYearsAgo ? twoYearsAgo : startDate;
  const to = new Date();

  const contratoDigits = normalizeContrato(contrato.numero_contrato);
  const fornecedorDigits = digitsOnly(contrato.fornecedor_cnpj || "");

  let pagina = 1;
  let hasMore = true;

  while (hasMore && pagina <= 20) {
    try {
      const dataInicio = `${String(from.getDate()).padStart(2, "0")}/${String(from.getMonth() + 1).padStart(2, "0")}/${from.getFullYear()}`;
      const dataFim = `${String(to.getDate()).padStart(2, "0")}/${String(to.getMonth() + 1).padStart(2, "0")}/${to.getFullYear()}`;
      // Endpoint: documentos de despesa (fase empenho). Filtro por órgão SIAFI + fase=Empenho
      const url = `${API_BASE}/despesas/documentos?dataEmissaoDe=${encodeURIComponent(dataInicio)}&dataEmissaoAte=${encodeURIComponent(dataFim)}&codigoOrgao=${encodeURIComponent(contrato.codigo_siafi)}&fase=EMPENHO&pagina=${pagina}`;

      const resp = await fetchWithRetry(url, apiKey);
      if (!resp.ok) {
        const txt = await resp.text();
        errors.push(`contrato ${contrato.contrato_id} p${pagina}: HTTP ${resp.status} ${txt.slice(0, 150)}`);
        break;
      }
      const items: any[] = await resp.json();
      if (!Array.isArray(items) || items.length === 0) {
        hasMore = false;
        break;
      }

      // Cruza: mantém empenhos cujo documento contém o número do contrato OU cujo favorecido é o mesmo CNPJ
      const matches = items.filter((it: any) => {
        const doc = normalizeContrato(it.documento || it.documentoResumido || "");
        const favCnpj = digitsOnly(it.favorecido?.cnpj || it.favorecido?.codigo || "");
        const docMatch = contratoDigits && doc && doc.includes(contratoDigits);
        const fornMatch = fornecedorDigits && favCnpj && favCnpj === fornecedorDigits;
        return docMatch || fornMatch;
      });

      if (matches.length > 0) {
        const rows = matches
          .map((it) => extractEmpenhoRow(it, contrato.cnpj_orgao, contrato.codigo_siafi))
          .filter((r) => r.numero_empenho)
          .map((r) => ({
            ...r,
            contrato_id: contrato.contrato_id,
            licitacao_id: contrato.licitacao_id,
          }));

        if (rows.length > 0) {
          const { error, count } = await supabase
            .from("empenhos")
            .upsert(rows, { onConflict: "fonte,cnpj_orgao,numero_empenho", count: "exact", ignoreDuplicates: false });
          if (error) errors.push(`upsert contrato ${contrato.contrato_id}: ${error.message}`);
          else inserted += count || rows.length;
        }
      }

      hasMore = items.length >= 15; // page size da API é ~15
      pagina++;
      await new Promise((r) => setTimeout(r, 200));
    } catch (e: any) {
      errors.push(`contrato ${contrato.contrato_id} p${pagina}: ${e?.message}`);
      break;
    }
  }

  return { inserted, errors };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const apiKey = Deno.env.get("PORTAL_TRANSPARENCIA_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "PORTAL_TRANSPARENCIA_API_KEY not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let body: any = {};
    try { body = await req.json(); } catch { /* GET/no body */ }
    const limit = Math.min(Number(body.limit ?? 100), 500);
    const onlyClientes = body.only_clientes !== false; // padrão: só clientes

    const { data: contratos, error: eCont } = await supabase.rpc("contratos_para_ingestao_empenhos", {
      p_limit: limit,
      p_only_clientes: onlyClientes,
    });
    if (eCont) throw eCont;

    console.log(`Processing ${contratos?.length || 0} contratos (only_clientes=${onlyClientes})`);

    let totalInserted = 0;
    const allErrors: string[] = [];
    for (const c of contratos || []) {
      const { inserted, errors } = await ingestForContrato(supabase, apiKey, c);
      totalInserted += inserted;
      allErrors.push(...errors);
    }

    // log
    await supabase.from("ingestao_logs").insert({
      fonte: "EMPENHOS_FEDERAL",
      tipo: "ingest-empenhos-federal",
      status: allErrors.length > 0 ? "partial" : "success",
      total_registros: totalInserted,
      metadata: {
        contratos_processados: contratos?.length || 0,
        only_clientes: onlyClientes,
        errors: allErrors.slice(0, 20),
      },
    }).then();

    return new Response(
      JSON.stringify({
        success: true,
        contratos_processados: contratos?.length || 0,
        empenhos_inseridos: totalInserted,
        errors: allErrors.slice(0, 20),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("ingest-empenhos-federal error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e?.message || String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
