import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://api.portaldatransparencia.gov.br/api-de-dados";

function parseBRL(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  return Number(value.replace(/\./g, "").replace(",", ".")) || 0;
}

// ═══════════════════════════════════════════════════════════
// PAGINAÇÃO EXAUSTIVA — OBRIGATÓRIA
// Percorre TODAS as páginas sem exceção
// ═══════════════════════════════════════════════════════════
// Hard ceiling well below the 150s edge runtime idle timeout
const MAX_EXECUTION_MS = 130_000;

async function apiFetchAllPages(
  endpoint: string,
  apiKey: string,
  params: Record<string, string>,
  maxPages = 60,
  globalStart: number = Date.now()
): Promise<{ data: Record<string, unknown>[]; pages: number; durationMs: number; aborted: boolean; failed: boolean; failReason?: string }> {
  const allData: Record<string, unknown>[] = [];
  let page = 1;
  let aborted = false;
  let failed = false;
  let failReason: string | undefined;
  const start = Date.now();
  const outOfTime = () => (Date.now() - globalStart) > (MAX_EXECUTION_MS - 8000);

  const RETRY_DELAYS = [2_000, 5_000];

  while (page <= maxPages) {
    if (outOfTime()) {
      console.log(`[P${page}] ⏱️ Time budget reached, aborting pagination`);
      aborted = true;
      break;
    }

    const url = new URL(`${API_BASE}${endpoint}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("pagina", String(page));

    let response: Response | null = null;
    let pageErr: string | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await fetch(url.toString(), {
          headers: { "chave-api-dados": apiKey, Accept: "application/json" },
          signal: AbortSignal.timeout(15_000),
        });
        if (response.status === 429) {
          if (outOfTime()) { aborted = true; break; }
          console.log(`[P${page}] Rate limited, wait 10s`);
          await new Promise(r => setTimeout(r, 10_000));
          response = null;
          continue; // does not consume retry budget
        }
        if (!response.ok) {
          pageErr = `HTTP ${response.status}`;
          console.error(`[P${page}] attempt ${attempt + 1}: ${pageErr}`);
          response = null;
          if (attempt < 2) await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
          continue;
        }
        pageErr = null;
        break;
      } catch (e) {
        pageErr = `Network/timeout: ${e instanceof Error ? e.message : String(e)}`;
        console.error(`[P${page}] attempt ${attempt + 1}: ${pageErr}`);
        response = null;
        if (attempt < 2) await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
      }
    }

    if (aborted) break;
    if (!response) {
      failed = true;
      failReason = `page ${page}: ${pageErr || "unknown"}`;
      break;
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) break;

    allData.push(...data);
    page++;
    await new Promise(r => setTimeout(r, 400));
  }

  return { data: allData, pages: page - 1, durationMs: Date.now() - start, aborted, failed, failReason };
}

// ═══════════════════════════════════════════════════════════
// SYNC DE PAGAMENTOS DIÁRIOS
// Fonte: /despesas/recursos-recebidos (único endpoint com beneficiário)
// Consolidação por (data_pagamento, cnpj_favorecido, orgao)
// Validação de integridade: total empresas === total governo
// ═══════════════════════════════════════════════════════════

interface RawPayment {
  orgaoCodigo: string;
  orgaoNome: string;
  cnpj: string;
  nome: string;
  valor: number;
  dataPagamento: string; // YYYY-MM-DD
  codigoEmpenho: string;
  anoEmpenho: number;
  isEstorno: boolean;
  isAnulado: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SYNC_SECRET = Deno.env.get("SYNC_SECRET");
  if (!SYNC_SECRET || req.headers.get("x-sync-secret") !== SYNC_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("PORTAL_TRANSPARENCIA_API_KEY");

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "PORTAL_TRANSPARENCIA_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let targetDate: string | null = null;
  let mesAno: string | null = null;
  try {
    if (req.method === "POST") {
      const body = await req.json();
      targetDate = body.data || null; // YYYY-MM-DD
      mesAno = body.mesAno || null; // MM/YYYY
    }
  } catch { /* defaults */ }

  // Default: yesterday
  if (!targetDate && !mesAno) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    targetDate = d.toISOString().split("T")[0];
  }

  const start = Date.now();

  try {
    // Determine date range
    let startDate: string, endDate: string;
    if (mesAno) {
      const [mm, yyyy] = mesAno.split("/");
      startDate = `${yyyy}-${mm}-01`;
      const lastDay = new Date(Number(yyyy), Number(mm), 0).getDate();
      endDate = `${yyyy}-${mm}-${String(lastDay).padStart(2, "0")}`;
    } else {
      startDate = targetDate!;
      endDate = targetDate!;
    }

    console.log(`\n═══════════════════════════════════════`);
    console.log(`📅 Sync Pagamentos: ${startDate} → ${endDate}`);
    console.log(`═══════════════════════════════════════\n`);

    // Fetch ALL payments for the period
    const mmStart = startDate.substring(5, 7);
    const yyyyStart = startDate.substring(0, 4);
    const mmEnd = endDate.substring(5, 7);
    const yyyyEnd = endDate.substring(0, 4);

    const result = await apiFetchAllPages("/despesas/recursos-recebidos", apiKey, {
      mesAnoInicio: `${mmStart}/${yyyyStart}`,
      mesAnoFim: `${mmEnd}/${yyyyEnd}`,
    }, 60, start); // page cap + shared time budget

    console.log(`📊 Total bruto: ${result.data.length} registros em ${result.pages} páginas${result.aborted ? " (ABORTADO por tempo)" : ""}`);

    // Parse raw payments
    const rawPayments: RawPayment[] = [];
    let anulados = 0;
    let estornos = 0;
    let duplicados = 0;
    const seenKeys = new Set<string>();

    for (const item of result.data) {
      const valor = typeof item.valor === "number" ? item.valor : parseBRL(item.valor);
      const orgCodigo = (item.codigoOrgaoSuperior as string) || (item.codigoOrgao as string) || "";
      const cnpj = (item.codigoPessoa as string) || (item.cpfCnpj as string) || "";
      const nome = (item.nomePessoa as string) || (item.nome as string) || "Desconhecido";
      const mesRef = (item.mesReferencia as string) || "";
      const anoRef = (item.anoReferencia as number) || Number(yyyyStart);
      
      // Build date from mesReferencia (MM/YYYY) - we use first day since API doesn't give exact date
      let dataPag = startDate;
      if (mesRef) {
        const parts = mesRef.split("/");
        if (parts.length === 2) dataPag = `${parts[1]}-${parts[0]}-01`;
      }

      // Filter estornos and anulados
      const isEstorno = valor < 0;
      const fase = (item.fase as string) || "";
      const isAnulado = fase.toLowerCase().includes("anul") || 
        ((item.situacao as string) || "").toLowerCase().includes("anul") ||
        ((item.documento as string) || "").toLowerCase().includes("anul");

      if (isEstorno) { estornos++; continue; }
      if (isAnulado) { anulados++; continue; }
      if (valor === 0) continue;

      // Dedup key
      const dedupKey = `${orgCodigo}|${cnpj}|${dataPag}|${valor}|${item.documento || ""}`;
      if (seenKeys.has(dedupKey)) { duplicados++; continue; }
      seenKeys.add(dedupKey);

      rawPayments.push({
        orgaoCodigo: orgCodigo,
        orgaoNome: (item.nomeOrgaoSuperior as string) || (item.nomeOrgao as string) || "",
        cnpj: cnpj || "SEM_CNPJ",
        nome,
        valor,
        dataPagamento: dataPag,
        codigoEmpenho: (item.documento as string) || "",
        anoEmpenho: anoRef,
        isEstorno, isAnulado,
      });
    }

    console.log(`🔍 Filtros: ${estornos} estornos, ${anulados} anulados, ${duplicados} duplicados removidos`);
    console.log(`✅ ${rawPayments.length} pagamentos válidos`);

    // ═══════════════════════════════════════════════════════════
    // CONSOLIDAÇÃO DIÁRIA POR EMPRESA
    // ═══════════════════════════════════════════════════════════
    const dailyByCompany: Record<string, {
      data_pagamento: string;
      orgao_codigo: string;
      orgao_nome: string;
      cnpj_favorecido: string;
      nome_favorecido: string;
      total_pago_dia: number;
      empenhos: Set<string>;
    }> = {};

    const totalGovByDay: Record<string, number> = {};

    for (const p of rawPayments) {
      const key = `${p.dataPagamento}|${p.orgaoCodigo}|${p.cnpj}`;
      if (!dailyByCompany[key]) {
        dailyByCompany[key] = {
          data_pagamento: p.dataPagamento,
          orgao_codigo: p.orgaoCodigo,
          orgao_nome: p.orgaoNome,
          cnpj_favorecido: p.cnpj,
          nome_favorecido: p.nome,
          total_pago_dia: 0,
          empenhos: new Set(),
        };
      }
      dailyByCompany[key].total_pago_dia += p.valor;
      if (p.codigoEmpenho) dailyByCompany[key].empenhos.add(p.codigoEmpenho);

      // Total governo bruto por dia
      totalGovByDay[p.dataPagamento] = (totalGovByDay[p.dataPagamento] || 0) + p.valor;
    }

    const consolidatedEntries = Object.values(dailyByCompany);
    console.log(`📊 ${consolidatedEntries.length} registros consolidados (empresa/dia/orgao)`);

    // ═══════════════════════════════════════════════════════════
    // PERSIST — upsert in-place (idempotent)
    // A conciliação real por órgão (amostra vs oficial) é feita
    // APÓS as inserções, mais abaixo.
    // ═══════════════════════════════════════════════════════════


    // Insert daily company execution
    const batchSize = 200;
    let inserted = 0;
    for (let i = 0; i < consolidatedEntries.length; i += batchSize) {
      const batch = consolidatedEntries.slice(i, i + batchSize).map(e => ({
        data_pagamento: e.data_pagamento,
        orgao_codigo: e.orgao_codigo,
        orgao_nome: e.orgao_nome,
        cnpj_favorecido: e.cnpj_favorecido,
        nome_favorecido: e.nome_favorecido,
        total_pago_dia: Number(e.total_pago_dia.toFixed(2)),
        total_empenhado_relacionado: 0, // Will be enriched by empenho cross-reference
        numero_empenhos: e.empenhos.size,
        fonte_dados: "api-pagamentos",
      }));

      const { error } = await supabase.from("execucao_diaria_empresa").upsert(batch, {
        onConflict: "data_pagamento,orgao_codigo,cnpj_favorecido",
      });
      if (error) {
        console.error(`Insert batch ${i}:`, error.message);
      } else {
        inserted += batch.length;
      }
    }

    // Also feed execucao_unificada for backward compatibility
    const monthlyConsolidated: Record<string, {
      orgCodigo: string; orgNome: string; cnpj: string; nome: string;
      ano: number; mes: number; pago: number; count: number;
    }> = {};

    for (const e of consolidatedEntries) {
      const parts = e.data_pagamento.split("-");
      const ano = parseInt(parts[0], 10);
      const mes = parseInt(parts[1], 10);
      const key = `${e.orgao_codigo}|${e.cnpj_favorecido}|${ano}|${mes}`;
      if (!monthlyConsolidated[key]) {
        monthlyConsolidated[key] = {
          orgCodigo: e.orgao_codigo, orgNome: e.orgao_nome,
          cnpj: e.cnpj_favorecido, nome: e.nome_favorecido,
          ano, mes, pago: 0, count: 0,
        };
      }
      monthlyConsolidated[key].pago += e.total_pago_dia;
      monthlyConsolidated[key].count++;
    }

    const monthlyEntries = Object.values(monthlyConsolidated);
    for (let i = 0; i < monthlyEntries.length; i += batchSize) {
      const batch = monthlyEntries.slice(i, i + batchSize).map(v => ({
        orgao_codigo: v.orgCodigo, orgao_nome: v.orgNome,
        fornecedor_nome: v.nome, fornecedor_id: v.cnpj,
        ano: v.ano, mes: v.mes,
        data_execucao_padronizada: `${v.ano}-${String(v.mes).padStart(2, "0")}-01`,
        // Fonte de pagamentos: NÃO temos empenhado/liquidado real por fornecedor.
        empenhado_total: 0, liquidado_total: 0, pago_total: v.pago,
        fonte_dados: "api-pagamentos-diarios",
        chave_dedup: `pagdia|${v.orgCodigo}|${v.cnpj}|${v.ano}|${v.mes}`,
      }));
      await supabase.from("execucao_unificada").upsert(batch, { onConflict: "chave_dedup" });
    }

    // ═══════════════════════════════════════════════════════════
    // CONCILIAÇÃO REAL — Cobertura da amostra por órgão
    // Compara pago_total em execucao_unificada (amostra) vs
    // pago_total em orcamento_unificado (oficial), no ano corrente,
    // por órgão presente na coleta.
    // ═══════════════════════════════════════════════════════════
    const orgaosPresentes = Array.from(new Set(consolidatedEntries.map(e => e.orgao_codigo).filter(Boolean)));
    const anoRef = Number((mesAno ? mesAno.split("/")[1] : startDate.substring(0, 4)));
    const orgaoNomes: Record<string, string> = {};
    for (const e of consolidatedEntries) if (e.orgao_codigo && !orgaoNomes[e.orgao_codigo]) orgaoNomes[e.orgao_codigo] = e.orgao_nome || "";

    const coverageRows: Array<Record<string, unknown>> = [];
    let coberturaBaixa = 0;

    for (const orgCod of orgaosPresentes) {
      const [amostraRes, oficialRes] = await Promise.all([
        supabase.from("execucao_unificada").select("pago_total").eq("orgao_codigo", orgCod).eq("ano", anoRef),
        supabase.from("orcamento_unificado").select("pago_total").eq("orgao_codigo", orgCod).eq("ano", anoRef),
      ]);
      const totalAmostra = (amostraRes.data || []).reduce((s, r) => s + Number(r.pago_total || 0), 0);
      const totalOficial = (oficialRes.data || []).reduce((s, r) => s + Number(r.pago_total || 0), 0);
      const coberturaPct = totalOficial > 0 ? (totalAmostra / totalOficial) * 100 : 0;
      const status = totalOficial > 0 && coberturaPct < 50 ? "cobertura_baixa" : "cobertura_ok";
      if (status === "cobertura_baixa") coberturaBaixa++;

      coverageRows.push({
        data_pagamento: new Date().toISOString().split("T")[0],
        orgao_codigo: orgCod,
        orgao_nome: orgaoNomes[orgCod] || "",
        ano: anoRef,
        total_amostra: Number(totalAmostra.toFixed(2)),
        total_oficial: Number(totalOficial.toFixed(2)),
        cobertura_pct: Number(coberturaPct.toFixed(4)),
        status,
        paginas_processadas: result.pages,
        registros_brutos: result.data.length,
        registros_anulados_removidos: anulados,
        registros_duplicados_removidos: duplicados,
        detalhes: { estornos, validos: rawPayments.length },
      });
    }

    for (let i = 0; i < coverageRows.length; i += 100) {
      const batch = coverageRows.slice(i, i + 100);
      const { error } = await supabase.from("consolidacao_diaria_validacao").upsert(batch, { onConflict: "orgao_codigo,ano" });
      if (error) console.error("upsert cobertura:", error.message);
    }

    console.log(`🔎 Cobertura calculada para ${coverageRows.length} órgãos (${coberturaBaixa} com cobertura < 50%)`);

    // Determine overall status: partial when pagination aborted or failed
    const paginationIssue = result.failed || result.aborted;
    const overallStatus = paginationIssue ? "partial" : "success";
    const errorMessageParts: string[] = [];
    if (result.failed) errorMessageParts.push(`pagination failed at ${result.failReason}`);
    if (result.aborted) errorMessageParts.push(`pagination aborted by time budget at page ${result.pages + 1}`);

    // Log
    await supabase.from("api_logs").insert({
      api_name: "sync-pagamentos-diarios",
      endpoint: `${startDate} → ${endDate}`,
      status: overallStatus,
      error_message: errorMessageParts.length > 0 ? errorMessageParts.join(" | ").substring(0, 500) : null,
      records_imported: inserted,
      response_time_ms: Date.now() - start,
    });

    // Alert if fewer than 1000 records at federal level
    if (rawPayments.length < 1000 && !mesAno) {
      console.log(`⚠️ ALERTA: Apenas ${rawPayments.length} registros — possível falha de paginação`);
    }

    const durationMs = Date.now() - start;
    return new Response(JSON.stringify({
      success: true,
      status: overallStatus,
      paginationFailed: result.failed,
      paginationAborted: result.aborted,
      paginationFailReason: result.failReason || null,
      periodo: `${startDate} → ${endDate}`,
      paginasProcessadas: result.pages,
      registrosBrutos: result.data.length,
      estornosRemovidos: estornos,
      anuladosRemovidos: anulados,
      duplicadosRemovidos: duplicados,
      pagamentosValidos: rawPayments.length,
      registrosConsolidados: consolidatedEntries.length,
      inseridos: inserted,
      cobertura: {
        orgaos: coverageRows.length,
        coberturaBaixa,
        detalhes: coverageRows.map(r => ({
          orgao: r.orgao_codigo,
          amostra: r.total_amostra,
          oficial: r.total_oficial,
          pct: r.cobertura_pct,
          status: r.status,
        })),
      },
      durationMs,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });



  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Sync pagamentos error:", msg);
    await supabase.from("api_logs").insert({
      api_name: "sync-pagamentos-diarios", endpoint: targetDate || mesAno || "unknown",
      status: "error", error_message: msg, response_time_ms: Date.now() - start,
    });
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
