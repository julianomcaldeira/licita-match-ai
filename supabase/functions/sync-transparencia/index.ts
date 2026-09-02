import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://api.portaldatransparencia.gov.br/api-de-dados";

// ═══════════════════════════════════════════════════════════
// RELATÓRIO DE AUDITORIA — v3 FINAL
// ═══════════════════════════════════════════════════════════
// LIMITAÇÃO DA API (documentada e confirmada):
// - /despesas/por-orgao → RESUMO por órgão (empenhado/liquidado/pago) ✅
// - /despesas/recursos-recebidos → pagamentos detalhados, MAS:
//   * NÃO filtra por órgão (sempre retorna dados globais)
//   * Page size = 15 registros
//   * Total federal = milhões de registros = 100k+ requests
// - /despesas/documentos → exige UG + data exata (impraticável para bulk)
//
// ESTRATÉGIA:
// CAMADA 1: /despesas/por-orgao → orcamento_unificado (100% preciso)
// CAMADA 2: /despesas/recursos-recebidos mês a mês, 500 páginas/mês
//   → filtragem client-side → amostra representativa de beneficiários
// CAMADA 3: Popular tabelas legadas
// CAMADA 4: Validação de hierarquia + sanidade
//
// Para 100%: usar download CSV de portaldatransparencia.gov.br
// ═══════════════════════════════════════════════════════════

const TODOS_ORGAOS = [
  { codigo: "20000", nome: "Presidência da República" },
  { codigo: "22000", nome: "Ministério da Agricultura e Pecuária" },
  { codigo: "24000", nome: "Ministério da Ciência, Tecnologia e Inovações" },
  { codigo: "25000", nome: "Ministério da Fazenda" },
  { codigo: "26000", nome: "Ministério da Educação" },
  { codigo: "28000", nome: "Ministério do Desenvolvimento, Indústria, Comércio e Serviços" },
  { codigo: "30000", nome: "Ministério da Justiça e Segurança Pública" },
  { codigo: "32000", nome: "Ministério de Minas e Energia" },
  { codigo: "33000", nome: "Ministério da Previdência Social" },
  { codigo: "35000", nome: "Ministério das Relações Exteriores" },
  { codigo: "36000", nome: "Ministério da Saúde" },
  { codigo: "38000", nome: "Ministério do Trabalho e Emprego" },
  { codigo: "39000", nome: "Ministério dos Transportes" },
  { codigo: "40000", nome: "Ministério das Comunicações" },
  { codigo: "41000", nome: "Ministério das Cidades" },
  { codigo: "42000", nome: "Ministério da Cultura" },
  { codigo: "44000", nome: "Ministério do Meio Ambiente" },
  { codigo: "49000", nome: "Ministério do Desenvolvimento Agrário e Agricultura Familiar" },
  { codigo: "51000", nome: "Ministério do Esporte" },
  { codigo: "52000", nome: "Ministério da Defesa" },
  { codigo: "53000", nome: "Ministério do Desenvolvimento e Assistência Social" },
  { codigo: "54000", nome: "Ministério do Turismo" },
  { codigo: "55000", nome: "Ministério da Integração e do Desenvolvimento Regional" },
  { codigo: "56000", nome: "Ministério da Gestão e da Inovação em Serviços Públicos" },
  { codigo: "57000", nome: "Ministério dos Povos Indígenas" },
  { codigo: "58000", nome: "Ministério da Igualdade Racial" },
  { codigo: "59000", nome: "Ministério das Mulheres" },
  { codigo: "60000", nome: "Ministério dos Portos e Aeroportos" },
  { codigo: "81000", nome: "Ministério da Pesca e Aquicultura" },
];

function parseBRL(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  return Number(value.replace(/\./g, "").replace(",", ".")) || 0;
}

// ═══════════════════════════════════════════════════════════
// PAGINAÇÃO EXAUSTIVA — sem assumir page size
// Continua até resposta vazia ou página com 0 registros
// ═══════════════════════════════════════════════════════════
// Hard ceiling for the whole function execution to stay under the 150s edge timeout.
const MAX_EXECUTION_MS = 130_000;
let GLOBAL_START = Date.now();
const timeRemaining = () => MAX_EXECUTION_MS - (Date.now() - GLOBAL_START);
const outOfTime = () => timeRemaining() <= 5_000;

async function apiFetchAllPages(
  endpoint: string,
  apiKey: string,
  params: Record<string, string>,
  maxPages = 500
): Promise<{ data: Record<string, unknown>[]; pages: number; durationMs: number; aborted: boolean; failed: boolean; failReason?: string }> {
  const allData: Record<string, unknown>[] = [];
  let page = 1;
  const start = Date.now();
  let aborted = false;
  let failed = false;
  let failReason: string | undefined;

  const RETRY_DELAYS = [2_000, 5_000]; // 2s, 5s between retries (3 attempts total)

  while (page <= maxPages) {
    if (outOfTime()) { aborted = true; break; }
    const url = new URL(`${API_BASE}${endpoint}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("pagina", String(page));

    console.log(`[P${page}] ${url.toString()}`);

    let response: Response | null = null;
    let pageErr: string | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await fetch(url.toString(), {
          headers: { "chave-api-dados": apiKey, Accept: "application/json" },
          signal: AbortSignal.timeout(15_000),
        });
        if (response.status === 429) {
          console.log(`[P${page}] Rate limited, wait 30s`);
          await new Promise(r => setTimeout(r, 30_000));
          if (outOfTime()) { aborted = true; break; }
          response = null;
          continue; // does not consume retry budget
        }
        if (!response.ok) {
          const body = await response.text();
          pageErr = `HTTP ${response.status}: ${body.substring(0, 200)}`;
          console.error(`[P${page}] attempt ${attempt + 1}: ${pageErr}`);
          response = null;
          if (attempt < 2) await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
          continue;
        }
        pageErr = null;
        break; // success
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

  let ano = new Date().getFullYear();
  let syncType = "all";
  let codigoOrgao: string | null = null;
  let debug = false;
  try {
    if (req.method === "POST") {
      const body = await req.json();
      ano = body.ano || ano;
      syncType = body.syncType || syncType;
      codigoOrgao = body.codigoOrgao || null;
      debug = body.debug || false;
    }
  } catch { /* defaults */ }

  // ═══════════════════════════════════════════════════════════
  // DEBUG: inspeção crua da API
  // ═══════════════════════════════════════════════════════════
  if (debug) {
    try {
      const orgCode = codigoOrgao || "26000";
      const mesAtual = String(new Date().getMonth() + 1).padStart(2, "0");
      
      // Testar múltiplas variantes do endpoint documentos
      const endpoints = [
        { label: "por_orgao", url: `${API_BASE}/despesas/por-orgao?ano=${ano}&orgao=${orgCode}&pagina=1` },
        { label: "func_prog_funcao12", url: `${API_BASE}/despesas/por-funcional-programatica?ano=${ano}&codigoOrgao=${orgCode}&funcao=12&pagina=1` },
        { label: "func_prog_funcao28", url: `${API_BASE}/despesas/por-funcional-programatica?ano=${ano}&codigoOrgao=${orgCode}&funcao=28&pagina=1` },
      ];

      const results: Record<string, unknown> = {};
      for (const ep of endpoints) {
        try {
          const r = await fetch(ep.url, { headers: { "chave-api-dados": apiKey, Accept: "application/json" } });
          const body = await r.json();
          results[ep.label] = {
            status: r.status,
            count: Array.isArray(body) ? body.length : "not_array",
            sample: Array.isArray(body) ? body.slice(0, 1) : body,
            keys: Array.isArray(body) && body.length > 0 ? Object.keys(body[0]) : [],
          };
        } catch (e) {
          results[ep.label] = { error: e instanceof Error ? e.message : "unknown" };
        }
      }

      return new Response(JSON.stringify({ audit_v2: results }, null, 2), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e: unknown) {
      return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PIPELINE PRINCIPAL — 4 CAMADAS
  // ═══════════════════════════════════════════════════════════
  const globalStart = Date.now();
  GLOBAL_START = globalStart; // reset global timer for this invocation
  const results: Record<string, unknown> = {};
  const orgaos = codigoOrgao
    ? TODOS_ORGAOS.filter(o => o.codigo === codigoOrgao).length > 0
      ? TODOS_ORGAOS.filter(o => o.codigo === codigoOrgao)
      : [{ codigo: codigoOrgao, nome: "" }]
    : TODOS_ORGAOS;

  try {
    // ═══════════════════════════════════════════════════════════
    // CAMADA 1: /despesas/por-orgao → orcamento_unificado
    // FONTE AUTORITATIVA: empenhado/liquidado/pago por órgão
    // Paginação exaustiva por órgão
    // ═══════════════════════════════════════════════════════════
    if (syncType === "all" || syncType === "orcamento") {
      results.orcamento = await syncOrcamentoUnificado(supabase, apiKey, ano, orgaos);
    }

    // ═══════════════════════════════════════════════════════════
    // CAMADA 2: /despesas/recursos-recebidos → execucao_unificada
    // COLETA GLOBAL (sem filtro de órgão — API não suporta)
    // Processado MÊS A MÊS para manter volume gerenciável
    // Filtragem por órgão feita CLIENT-SIDE
    // ═══════════════════════════════════════════════════════════
    if (syncType === "all" || syncType === "despesas") {
      results.execucao = await syncExecucaoGlobal(supabase, apiKey, ano, orgaos);
    }

    // ═══════════════════════════════════════════════════════════
    // CAMADA 3: Popular tabelas legadas a partir do canônico
    // ═══════════════════════════════════════════════════════════
    if (syncType === "all") {
      results.legacy = await syncLegacyTables(supabase, ano);
    }

    // ═══════════════════════════════════════════════════════════
    // CAMADA 4: Validação, conciliação e sanidade
    // ═══════════════════════════════════════════════════════════
    results.validation = await runIntegrityValidation(supabase, ano);

    const durationMs = Date.now() - globalStart;
    results.pipeline = { durationMs, orgaosProcessed: orgaos.length };

    const partialParts: string[] = [];
    const orc = results.orcamento as { partial?: boolean; partialReasons?: string[] } | undefined;
    const exe = results.execucao as { partial?: boolean; partialReasons?: string[] } | undefined;
    if (orc?.partial) partialParts.push(`orcamento: ${(orc.partialReasons || []).join("; ")}`);
    if (exe?.partial) partialParts.push(`execucao: ${(exe.partialReasons || []).join("; ")}`);
    const overallStatus = partialParts.length > 0 ? "partial" : "success";
    const errorMessage = partialParts.length > 0 ? partialParts.join(" | ").substring(0, 500) : null;

    await logApiCall(supabase, "sync-transparencia", `sync-${syncType}`, overallStatus, errorMessage, results, durationMs);

    return new Response(JSON.stringify({ success: true, status: overallStatus, ano, orgaos: orgaos.length, durationMs, partialReasons: partialParts, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Pipeline error:", msg);
    await logApiCall(supabase, "sync-transparencia", `sync-${syncType}`, "error", msg, null, Date.now() - globalStart);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ═══════════════════════════════════════════════════════════
// CAMADA 1: ORÇAMENTO UNIFICADO (AUTORITATIVO)
// /despesas/por-orgao: empenhado, liquidado, pago (acumulado anual)
// ═══════════════════════════════════════════════════════════
async function syncOrcamentoUnificado(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  ano: number,
  orgaos: Array<{ codigo: string; nome: string }>
) {
  let totalOrgaos = 0;
  let totalEmpenhado = 0;
  let totalPages = 0;
  const start = Date.now();
  const partialReasons: string[] = [];

  for (const orgao of orgaos) {
    try {
      const result = await apiFetchAllPages("/despesas/por-orgao", apiKey, {
        ano: String(ano), orgao: orgao.codigo,
      });

      if (result.failed) partialReasons.push(`orgao ${orgao.codigo}: ${result.failReason}`);
      if (result.aborted) partialReasons.push(`orgao ${orgao.codigo}: aborted by time budget`);

      if (result.data.length === 0) continue;

      let empenhado = 0, liquidado = 0, pago = 0;
      let nomeApi = orgao.nome;
      for (const item of result.data) {
        empenhado += parseBRL(item.empenhado);
        liquidado += parseBRL(item.liquidado);
        pago += parseBRL(item.pago);
        if (item.orgaoSuperior) nomeApi = item.orgaoSuperior as string;
      }

      totalEmpenhado += empenhado;
      totalPages += result.pages;

      // NOTA: A API /despesas/por-orgao NÃO retorna dotação (orçamento autorizado).
      // Apenas empenhado/liquidado/pago. orcamento_autorizado e orcamento_atualizado
      // ficam como 0 até que dotação real seja importada via CSV.
      const { error } = await supabase.from("orcamento_unificado").upsert({
        orgao_codigo: orgao.codigo,
        orgao_nome: nomeApi,
        ano,
        orcamento_autorizado: 0,
        orcamento_atualizado: 0,
        empenhado_total: empenhado,
        liquidado_total: liquidado,
        pago_total: pago,
        fonte_dados: "/despesas/por-orgao",
      }, { onConflict: "orgao_codigo,ano" });

      if (error) console.error(`Upsert ${orgao.codigo}:`, error.message);

      await supabase.from("processing_logs").insert({
        orgao_codigo: orgao.codigo, orgao_nome: nomeApi, ano,
        etapa: "orcamento_unificado",
        registros_importados: result.data.length, registros_consolidados: 1,
        total_bruto: empenhado, total_consolidado: empenhado, diferenca_pct: 0,
        status: (result.failed || result.aborted) ? "partial" : "success",
        detalhes: {
          pages: result.pages, ms: result.durationMs, liquidado, pago,
          collection_status: (result.failed || result.aborted) ? "partial" : "success",
          ...(result.failed ? { failReason: result.failReason } : {}),
          ...(result.aborted ? { aborted: true } : {}),
        },
      });

      totalOrgaos++;
    } catch (e) {
      console.error(`❌ Budget ${orgao.codigo}:`, e);
      partialReasons.push(`orgao ${orgao.codigo}: ${e instanceof Error ? e.message : "unknown"}`);
    }
    if (outOfTime()) {
      console.warn("⏱️ Orçamento: tempo esgotado, abortando loop");
      partialReasons.push("orcamento loop aborted by time budget");
      break;
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // Sanity check
  const status = totalEmpenhado > 100_000_000_000 ? "OK" : "ALERTA_ORDEM_GRANDEZA";
  console.log(`✅ Orçamento: ${totalOrgaos} órgãos, R$ ${(totalEmpenhado / 1e9).toFixed(1)}B empenhado [${status}]`);

  return {
    totalOrgaos, totalEmpenhado, totalPages, status,
    durationMs: Date.now() - start,
    partial: partialReasons.length > 0,
    partialReasons,
  };
}

// ═══════════════════════════════════════════════════════════
// CAMADA 2: EXECUÇÃO DETALHADA POR ÓRGÃO
// Usa /despesas/documentos que ACEITA codigoOrgao
// Fase 3 = pagamentos (contém valor pago, favorecido, data)
// CAMADA 2: EXECUÇÃO DETALHADA — AMOSTRA REPRESENTATIVA
// /despesas/recursos-recebidos é o ÚNICO endpoint com dados por beneficiário
// LIMITAÇÃO: não filtra por órgão, page size 15
// ESTRATÉGIA: paginação exaustiva global mês a mês, filtragem client-side
// Até 500 páginas/mês = 7500 registros/mês (amostra dos maiores pagamentos)
// ═══════════════════════════════════════════════════════════
async function syncExecucaoGlobal(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  ano: number,
  orgaos: Array<{ codigo: string; nome: string }>
) {
  const orgaoCodes = new Set(orgaos.map(o => o.codigo));
  const start = Date.now();

  const consolidated: Record<string, {
    orgaoCodigo: string;
    orgaoNome: string;
    fornecedorId: string;
    fornecedorNome: string;
    mes: number;
    pago: number;
    count: number;
  }> = {};

  let totalRawRecords = 0;
  let totalPages = 0;
  let totalValor = 0;
  const partialReasons: string[] = [];
  const currentMonth = new Date().getMonth() + 1;
  // Apenas o mês atual por execução para caber em 150s.
  // Histórico anterior deve ser carregado via CSV ou execuções anteriores acumuladas.
  const mesesProcessar = [currentMonth];

  for (const mes of mesesProcessar) {
    if (outOfTime()) {
      console.warn("⏱️ Execução: tempo esgotado antes do mês", mes);
      partialReasons.push(`mes ${mes}: aborted before start (time budget)`);
      break;
    }
    const mesStr = String(mes).padStart(2, "0");
    console.log(`\n📅 Mês ${mesStr}/${ano}...`);

    // Cap agressivo: 60 páginas × 15 = ~900 registros (maiores pagamentos do mês)
    const result = await apiFetchAllPages("/despesas/recursos-recebidos", apiKey, {
      mesAnoInicio: `${mesStr}/${ano}`,
      mesAnoFim: `${mesStr}/${ano}`,
    }, 60);

    if (result.failed) partialReasons.push(`mes ${mes}: ${result.failReason}`);
    if (result.aborted) partialReasons.push(`mes ${mes}: aborted by time budget`);

    totalPages += result.pages;
    console.log(`📊 Mês ${mesStr}: ${result.data.length} registros em ${result.pages} páginas (${result.durationMs}ms)${result.aborted ? " [ABORTADO]" : ""}${result.failed ? " [FAILED]" : ""}`);

    for (const item of result.data) {
      const orgSuperior = (item.codigoOrgaoSuperior as string) || "";
      if (!orgaoCodes.has(orgSuperior)) continue;

      const fornecedorId = (item.codigoPessoa as string) || "SEM_CNPJ";
      const valor = typeof item.valor === "number" ? item.valor : parseBRL(item.valor);
      const key = `${orgSuperior}|${fornecedorId}|${mes}`;

      totalRawRecords++;
      totalValor += valor;

      if (!consolidated[key]) {
        consolidated[key] = {
          orgaoCodigo: orgSuperior,
          orgaoNome: (item.nomeOrgaoSuperior as string) || "",
          fornecedorId,
          fornecedorNome: (item.nomePessoa as string) || "Desconhecido",
          mes,
          pago: 0,
          count: 0,
        };
      }
      consolidated[key].pago += valor;
      consolidated[key].count++;
    }
  }

  // Persistir — UPSERT por chave_dedup (nunca DELETE + INSERT: se abortar, dados ficariam ausentes)
  const entries = Object.entries(consolidated);
  console.log(`\n💾 ${entries.length} registros consolidados de ${totalRawRecords} brutos`);

  const batchSize = 200;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize).map(([, v]) => ({
      orgao_codigo: v.orgaoCodigo,
      orgao_nome: v.orgaoNome,
      fornecedor_nome: v.fornecedorNome,
      fornecedor_id: v.fornecedorId,
      ano,
      mes: v.mes,
      data_execucao_padronizada: `${ano}-${String(v.mes).padStart(2, "0")}-01`,
      // /despesas/recursos-recebidos só informa pagamentos por beneficiário.
      // Empenhado/liquidado por fornecedor NÃO existem nessa fonte — gravamos 0
      // para evitar rotular pagamento como empenho em telas downstream.
      empenhado_total: 0,
      liquidado_total: 0,
      pago_total: v.pago,
      fonte_dados: "/despesas/recursos-recebidos",
      chave_dedup: `${v.orgaoCodigo}|${v.fornecedorId}|${ano}|${v.mes}`,
    }));

    const { error } = await supabase.from("execucao_unificada").upsert(batch, { onConflict: "chave_dedup" });
    if (error) console.error(`Upsert batch ${i}:`, error.message);
  }

  const partial = partialReasons.length > 0;

  // Logs por órgão
  for (const orgao of orgaos) {
    const orgEntries = entries.filter(([, v]) => v.orgaoCodigo === orgao.codigo);
    const orgTotal = orgEntries.reduce((s, [, v]) => s + v.pago, 0);

    await supabase.from("processing_logs").insert({
      orgao_codigo: orgao.codigo, orgao_nome: orgao.nome, ano,
      etapa: "execucao_unificada",
      registros_importados: orgEntries.reduce((s, [, v]) => s + v.count, 0),
      registros_consolidados: orgEntries.length,
      total_bruto: orgTotal, total_consolidado: orgTotal, diferenca_pct: 0,
      status: partial ? "partial" : "success",
      detalhes: {
        metodo: "recursos_recebidos_global_filtro_client_side",
        meses: mesesProcessar,
        max_pages_por_mes: 500,
        nota: "Amostra representativa — API não suporta filtro por órgão",
        ...(partial ? { partialReasons } : {}),
      },
    });
  }

  const status = totalValor > 1_000_000 ? "AMOSTRA_REPRESENTATIVA" : "AMOSTRA_MINIMA";
  console.log(`✅ Execução: ${totalRawRecords} registros, ${entries.length} consolidados, R$ ${(totalValor / 1e6).toFixed(1)}M [${status}]${partial ? " [PARTIAL]" : ""}`);

  return {
    totalRawRecords, totalConsolidated: entries.length, totalValor,
    totalPages, mesesProcessados: mesesProcessar, status,
    durationMs: Date.now() - start,
    partial,
    partialReasons,
    metodo: "recursos-recebidos global com filtragem client-side (500 pags/mês)",
    limitacao: "API REST não oferece endpoint de execução detalhada com filtro por órgão — para 100% usar CSV de portaldatransparencia.gov.br/download-de-dados/despesas",
  };
}

// ═══════════════════════════════════════════════════════════
// CAMADA 3: TABELAS LEGADAS (backward compatibility)
// ═══════════════════════════════════════════════════════════
async function syncLegacyTables(
  supabase: ReturnType<typeof createClient>,
  ano: number
) {
  // Estratégia insert-then-swap: marca cada execução com sync_batch (timestamp).
  // Inserimos primeiro os novos registros com o batch atual e só depois de tudo
  // gravado com sucesso apagamos as linhas do mesmo ano com sync_batch anterior.
  // Se a função abortar no meio, os dados antigos continuam intactos.
  const syncBatch = new Date().toISOString();

  // ---------- Budget legacy ----------
  const { data: unified } = await supabase.from("orcamento_unificado").select("*").eq("ano", ano);
  let budgetInserted = 0;
  if (unified && unified.length > 0) {
    const rows = unified.map(u => ({
      ano, orgao: u.orgao_nome,
      dotacao_inicial: u.orcamento_autorizado || 0,
      dotacao_atualizada: u.orcamento_atualizado || 0,
      sync_batch: syncBatch,
    }));
    let budgetOk = true;
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from("orcamento_anual").insert(rows.slice(i, i + 500));
      if (error) { budgetOk = false; console.error("orcamento_anual insert:", error.message); break; }
      budgetInserted += Math.min(500, rows.length - i);
    }
    if (budgetOk) {
      // Só remove o batch anterior depois que todos os inserts do batch atual passaram
      const { error: delErr } = await supabase.from("orcamento_anual")
        .delete().eq("ano", ano).neq("sync_batch", syncBatch);
      if (delErr) console.error("orcamento_anual swap delete:", delErr.message);
    } else {
      console.warn("orcamento_anual: inserts falharam — mantendo batch anterior intacto");
    }
  }

  // ---------- Execution legacy ----------
  // Paginação exaustiva de execucao_unificada — sem limite arbitrário
  const pageSize = 1000;
  let offset = 0;
  let execInserted = 0;
  let execOk = true;
  while (true) {
    const { data: exec, error: readErr } = await supabase
      .from("execucao_unificada").select("*").eq("ano", ano)
      .range(offset, offset + pageSize - 1);
    if (readErr) { execOk = false; console.error("execucao_unificada read:", readErr.message); break; }
    if (!exec || exec.length === 0) break;

    const rows = exec.map(u => ({
      ano, orgao: u.orgao_nome,
      nome_favorecido: u.fornecedor_nome, cnpj_favorecido: u.fornecedor_id,
      valor_empenhado: u.empenhado_total, valor_liquidado: u.liquidado_total,
      valor_pago: u.pago_total, data_pagamento: u.data_execucao_padronizada,
      sync_batch: syncBatch,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from("execucao_despesa").insert(rows.slice(i, i + 500));
      if (error) { execOk = false; console.error("execucao_despesa insert:", error.message); break; }
      execInserted += Math.min(500, rows.length - i);
    }
    if (!execOk) break;

    if (exec.length < pageSize) break;
    offset += pageSize;
  }

  if (execOk && execInserted > 0) {
    const { error: delErr } = await supabase.from("execucao_despesa")
      .delete().eq("ano", ano).neq("sync_batch", syncBatch);
    if (delErr) console.error("execucao_despesa swap delete:", delErr.message);
  } else if (!execOk) {
    console.warn("execucao_despesa: inserts falharam — mantendo batch anterior intacto");
  }

  return { budget: budgetInserted, execution: execInserted };
}

// ═══════════════════════════════════════════════════════════
// CAMADA 4: VALIDAÇÃO + CONCILIAÇÃO + SANIDADE
// ═══════════════════════════════════════════════════════════
async function runIntegrityValidation(
  supabase: ReturnType<typeof createClient>,
  ano: number
) {
  const { data: unified } = await supabase.from("orcamento_unificado").select("*").eq("ano", ano);
  if (!unified || unified.length === 0) return { errors: 0 };

  const errors: Array<{
    tipo_erro: string; entidade: string;
    valor_detectado: number; valor_referencia: number;
    divergencia_pct: number; detalhes: Record<string, unknown>;
  }> = [];

  let totalEmpenhado = 0, totalPago = 0;

  for (const u of unified) {
    totalEmpenhado += u.empenhado_total || 0;
    totalPago += u.pago_total || 0;

    // Hierarquia: L > E
    if (u.liquidado_total > u.empenhado_total && u.empenhado_total > 0) {
      errors.push({
        tipo_erro: "liquidado_excede_empenhado", entidade: u.orgao_nome,
        valor_detectado: u.liquidado_total, valor_referencia: u.empenhado_total,
        divergencia_pct: Number(((u.liquidado_total - u.empenhado_total) / u.empenhado_total * 100).toFixed(2)),
        detalhes: { orgao_codigo: u.orgao_codigo, ano },
      });
    }

    // Hierarquia: P > L
    if (u.pago_total > u.liquidado_total && u.liquidado_total > 0) {
      errors.push({
        tipo_erro: "pago_excede_liquidado", entidade: u.orgao_nome,
        valor_detectado: u.pago_total, valor_referencia: u.liquidado_total,
        divergencia_pct: Number(((u.pago_total - u.liquidado_total) / u.liquidado_total * 100).toFixed(2)),
        detalhes: { orgao_codigo: u.orgao_codigo, ano },
      });
    }

    // Conciliação: execução detalhada vs resumo
    const { data: execSum } = await supabase.from("execucao_unificada")
      .select("pago_total").eq("orgao_codigo", u.orgao_codigo).eq("ano", ano);

    if (execSum && execSum.length > 0) {
      const totalPagoExec = execSum.reduce((s, r) => s + (r.pago_total || 0), 0);
      if (u.pago_total > 0 && totalPagoExec > 0) {
        const div = Math.abs((totalPagoExec - u.pago_total) / u.pago_total * 100);
        if (div > 0.5) {
          errors.push({
            tipo_erro: "divergencia_conciliacao", entidade: u.orgao_nome,
            valor_detectado: totalPagoExec, valor_referencia: u.pago_total,
            divergencia_pct: Number(div.toFixed(2)),
            detalhes: {
              orgao_codigo: u.orgao_codigo, ano,
              nota: `Detalhe pago R$ ${(totalPagoExec/1e6).toFixed(1)}M vs resumo R$ ${(u.pago_total/1e6).toFixed(1)}M — API recursos-recebidos tem cobertura parcial`,
              causa: "API nao suporta filtro por orgao — dados de detalhe são amostra",
            },
          });
        }
      }
    }
  }

  // Sanidade global
  if (totalEmpenhado > 0 && totalEmpenhado < 100_000_000_000) {
    errors.push({
      tipo_erro: "sanidade_total_federal", entidade: "TOTAL FEDERAL",
      valor_detectado: totalEmpenhado, valor_referencia: 100_000_000_000,
      divergencia_pct: 0,
      detalhes: { ano, nota: `Empenhado R$ ${(totalEmpenhado/1e9).toFixed(1)}B — esperado >R$ 100B` },
    });
  }

  // ═══════════════════════════════════════════════════════════
  // VALIDAÇÃO POR FAIXAS ESPERADAS (range anomaly detection)
  // Compara totais consolidados com faixas históricas/esperadas
  // do orçamento federal e sinaliza desvios anormais.
  // ═══════════════════════════════════════════════════════════
  // Faixas esperadas (R$) para o TOTAL FEDERAL no exercício corrente.
  // Baseadas em LOA recentes (~R$ 5,5T autorizado, ~R$ 4,5T empenhado/pago no fim do ano).
  const FED_RANGES = {
    empenhado: { min: 500_000_000_000, max: 6_000_000_000_000 },   // 500B – 6T
    pago:      { min: 300_000_000_000, max: 5_500_000_000_000 },   // 300B – 5.5T
  };
  const checkRange = (label: string, value: number, range: { min: number; max: number }) => {
    if (value <= 0) return;
    if (value < range.min || value > range.max) {
      const ref = value < range.min ? range.min : range.max;
      const div = Math.abs((value - ref) / ref * 100);
      errors.push({
        tipo_erro: "anomalia_faixa", entidade: `TOTAL FEDERAL — ${label}`,
        valor_detectado: value, valor_referencia: ref,
        divergencia_pct: Number(div.toFixed(2)),
        detalhes: {
          ano, campo: label,
          faixa_min: range.min, faixa_max: range.max,
          severidade: div > 50 ? "critica" : div > 20 ? "alta" : "media",
          nota: `${label} R$ ${(value/1e9).toFixed(1)}B fora da faixa esperada [R$ ${(range.min/1e9).toFixed(0)}B – R$ ${(range.max/1e9).toFixed(0)}B]`,
        },
      });
    }
  };
  checkRange("empenhado", totalEmpenhado, FED_RANGES.empenhado);
  checkRange("pago", totalPago, FED_RANGES.pago);

  // Por órgão: ratio pago/empenhado deve estar entre 0% e 110% (>110% = anomalia)
  for (const u of unified) {
    if ((u.empenhado_total || 0) > 1_000_000) {
      const ratio = (u.pago_total || 0) / u.empenhado_total;
      if (ratio > 1.1) {
        errors.push({
          tipo_erro: "anomalia_faixa", entidade: u.orgao_nome,
          valor_detectado: u.pago_total, valor_referencia: u.empenhado_total,
          divergencia_pct: Number(((ratio - 1) * 100).toFixed(2)),
          detalhes: {
            orgao_codigo: u.orgao_codigo, ano, campo: "ratio_pago_empenhado",
            severidade: ratio > 1.5 ? "critica" : "alta",
            nota: `Pago/Empenhado = ${(ratio * 100).toFixed(1)}% — esperado ≤ 110%`,
          },
        });
      }
    }
  }

  // Persist
  await supabase.from("data_integrity_logs").delete().gte("data", `${ano}-01-01`).lte("data", `${ano}-12-31`);
  if (errors.length > 0) {
    for (let i = 0; i < errors.length; i += 100) {
      await supabase.from("data_integrity_logs").insert(errors.slice(i, i + 100));
    }
  }

  return {
    totalOrgaos: unified.length, totalEmpenhado, totalPago,
    errors: errors.length,
    details: errors.map(e => `${e.tipo_erro}: ${e.entidade} (${e.divergencia_pct}%)`),
  };
}

// ═══════════════════════════════════════════════════════════
// LOG DE API — com timing e métricas
// ═══════════════════════════════════════════════════════════
async function logApiCall(
  supabase: ReturnType<typeof createClient>,
  apiName: string, endpoint: string, status: string,
  errorMessage: string | null, results: unknown, durationMs: number
) {
  let recordCount = 0;
  if (typeof results === "object" && results !== null) {
    for (const v of Object.values(results as Record<string, Record<string, number>>)) {
      recordCount += v?.totalOrgaos || v?.totalRawRecords || v?.totalConsolidated || 0;
    }
  }
  await supabase.from("api_logs").insert({
    api_name: apiName, endpoint, status,
    error_message: errorMessage,
    records_imported: recordCount,
    response_time_ms: durationMs,
  });
}
