import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PAGE_SIZE = 1000;

async function fetchAllFromTable(supabase: ReturnType<typeof createClient>, table: string, select: string, filters: Record<string, any> = {}) {
  let all: any[] = [];
  let page = 0;
  let hasMore = true;
  while (hasMore) {
    let query = supabase.from(table).select(select).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    for (const [key, val] of Object.entries(filters)) {
      query = query.eq(key, val);
    }
    const { data: batch, error } = await query;
    if (error || !batch || batch.length === 0) { hasMore = false; break; }
    all = all.concat(batch);
    if (batch.length < PAGE_SIZE) hasMore = false;
    page++;
  }
  return all;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SYNC_SECRET = Deno.env.get("SYNC_SECRET");
  if (!SYNC_SECRET || req.headers.get("x-sync-secret") !== SYNC_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let ano = new Date().getFullYear();
  let computeType = "all";
  try {
    if (req.method === "POST") {
      const body = await req.json();
      ano = body.ano || ano;
      computeType = body.computeType || "all";
    }
  } catch { /* defaults */ }

  const periodo = String(ano);
  const results: Record<string, unknown> = {};

  try {
    // CANONICAL SOURCES
    const unifiedBudget = await fetchAllFromTable(supabase, "orcamento_unificado",
      "orgao_nome, orgao_codigo, orcamento_atualizado, empenhado_total, liquidado_total, pago_total",
      { ano });

    const contracts = await fetchAllFromTable(supabase, "contratos_comprasgov",
      "cnpj_fornecedor, nome_fornecedor, valor, orgao, uf, categoria",
      { ano });

    // 1. CONCENTRATION ANALYSIS (HHI by organ) — from contratos_comprasgov
    if (computeType === "all" || computeType === "concentration") {
      results.concentration = await computeConcentration(supabase, contracts, periodo, ano);
    }

    // 2. ISCORES — from orcamento_unificado + contratos_comprasgov
    if (computeType === "all" || computeType === "iscores") {
      results.iscores = await computeIScores(supabase, contracts, unifiedBudget, periodo, ano);
    }

    // 3. MARKET INSIGHTS — from orcamento_unificado + contratos_comprasgov
    if (computeType === "all" || computeType === "insights") {
      results.insights = await computeInsights(supabase, contracts, unifiedBudget, periodo, ano);
    }

    // 4. EXECUTIVE REPORT — from orcamento_unificado + contratos_comprasgov
    if (computeType === "all" || computeType === "report") {
      results.report = await generateExecutiveReport(supabase, contracts, unifiedBudget, periodo, ano);
    }

    return new Response(JSON.stringify({ success: true, ano, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Analytics error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════
interface ContractRecord {
  cnpj_fornecedor: string;
  nome_fornecedor: string;
  valor: number;
  orgao: string | null;
  uf: string | null;
  categoria: string | null;
}

interface BudgetRecord {
  orgao_nome: string;
  orgao_codigo: string;
  orcamento_atualizado: number;
  empenhado_total: number;
  liquidado_total: number;
  pago_total: number;
}

// ═══════════════════════════════════════════════════════════
// CONCENTRATION ANALYSIS — from contratos_comprasgov
// ═══════════════════════════════════════════════════════════
async function computeConcentration(
  supabase: ReturnType<typeof createClient>,
  contracts: ContractRecord[],
  periodo: string,
  ano: number
) {
  // Group by organ → supplier
  const byOrgan: Record<string, Record<string, number>> = {};
  for (const c of contracts) {
    const org = c.orgao || "Outros";
    const forn = c.cnpj_fornecedor;
    if (!byOrgan[org]) byOrgan[org] = {};
    byOrgan[org][forn] = (byOrgan[org][forn] || 0) + (c.valor || 0);
  }

  await supabase.from("concentration_analysis").delete().eq("periodo", periodo).eq("ano", ano);

  const rows = [];
  for (const [orgao, fornecedores] of Object.entries(byOrgan)) {
    const entries = Object.entries(fornecedores).sort((a, b) => b[1] - a[1]);
    const totalValor = entries.reduce((s, [, v]) => s + v, 0);
    if (totalValor <= 0) continue;

    const hhi = entries.reduce((sum, [, v]) => {
      const share = (v / totalValor) * 100;
      return sum + share * share;
    }, 0);

    const top3 = entries.slice(0, 3).reduce((s, [, v]) => s + v, 0);
    const top5 = entries.slice(0, 5).reduce((s, [, v]) => s + v, 0);
    const top10 = entries.slice(0, 10).reduce((s, [, v]) => s + v, 0);

    let classificacao = "competitivo";
    if (hhi > 2500) classificacao = "altamente_concentrado";
    else if (hhi > 1500) classificacao = "concentrado";
    else if (hhi > 1000) classificacao = "moderado";

    rows.push({
      orgao,
      hhi_index: Math.round(hhi),
      top3_pct: Number(((top3 / totalValor) * 100).toFixed(1)),
      top5_pct: Number(((top5 / totalValor) * 100).toFixed(1)),
      top10_pct: Number(((top10 / totalValor) * 100).toFixed(1)),
      total_fornecedores: entries.length,
      total_pago: totalValor,
      periodo,
      ano,
      classificacao,
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("concentration_analysis").insert(rows);
    if (error) console.error("Concentration insert error:", error.message);
  }

  return { computed: rows.length };
}

// ═══════════════════════════════════════════════════════════
// ISCORES — from orcamento_unificado + contratos_comprasgov
// ═══════════════════════════════════════════════════════════
async function computeIScores(
  supabase: ReturnType<typeof createClient>,
  contracts: ContractRecord[],
  budget: BudgetRecord[],
  periodo: string,
  ano: number
) {
  await supabase.from("iscores").delete().eq("periodo", periodo).eq("ano", ano);

  const scores: Array<{
    entidade_tipo: string;
    entidade_nome: string;
    entidade_id: string | null;
    tipo_score: string;
    valor: number;
    componentes: Record<string, unknown>;
    periodo: string;
    ano: number;
  }> = [];

  // ── iScore de Oportunidade (per organ) — from orcamento_unificado ──
  // Mede a execução real: quanto do empenhado já foi pago
  // Quanto MENOS pago em relação ao empenhado, MAIOR a oportunidade
  for (const b of budget) {
    const empenhado = b.empenhado_total || 0;
    if (empenhado <= 0) continue;
    const liquidado = b.liquidado_total || 0;
    const pago = b.pago_total || 0;

    // Percentual ainda não pago do empenhado = oportunidade de fluxo
    const pctNaoPago = Math.max(0, ((empenhado - pago) / empenhado) * 100);
    // Percentual não liquidado = oportunidade de processamento
    const pctNaoLiquidado = Math.max(0, ((empenhado - liquidado) / empenhado) * 100);

    const oportunidade = Math.min(100, Math.round(
      pctNaoPago * 0.5 + pctNaoLiquidado * 0.3 + Math.min(empenhado / 1e10, 20)
    ));

    scores.push({
      entidade_tipo: "orgao",
      entidade_nome: b.orgao_nome,
      entidade_id: b.orgao_codigo,
      tipo_score: "oportunidade",
      valor: oportunidade,
      componentes: { pctNaoPago, pctNaoLiquidado, empenhado, liquidado, pago },
      periodo,
      ano,
    });
  }

  // ── iScore de Domínio de Mercado (per organ) — from contratos_comprasgov ──
  const byOrganForn: Record<string, Record<string, number>> = {};
  for (const c of contracts) {
    const org = c.orgao || "Outros";
    const forn = c.cnpj_fornecedor;
    if (!byOrganForn[org]) byOrganForn[org] = {};
    byOrganForn[org][forn] = (byOrganForn[org][forn] || 0) + (c.valor || 0);
  }

  for (const [orgao, fornecedores] of Object.entries(byOrganForn)) {
    const entries = Object.entries(fornecedores).sort((a, b) => b[1] - a[1]);
    const totalValor = entries.reduce((s, [, v]) => s + v, 0);
    if (totalValor <= 0) continue;

    const hhi = entries.reduce((sum, [, v]) => {
      const share = (v / totalValor) * 100;
      return sum + share * share;
    }, 0);

    const dominioScore = Math.min(100, Math.round(hhi / 100));

    scores.push({
      entidade_tipo: "orgao",
      entidade_nome: orgao,
      entidade_id: null,
      tipo_score: "dominio_mercado",
      valor: dominioScore,
      componentes: { hhi: Math.round(hhi), totalFornecedores: entries.length, totalValor },
      periodo,
      ano,
    });
  }

  // ── iScore de Dependência Pública (per fornecedor) — from contratos_comprasgov ──
  const fornecedorData: Record<string, { totalValor: number; orgaos: Set<string>; nome: string }> = {};
  let grandTotal = 0;
  for (const c of contracts) {
    const forn = c.cnpj_fornecedor;
    if (!fornecedorData[forn]) {
      fornecedorData[forn] = { totalValor: 0, orgaos: new Set(), nome: c.nome_fornecedor };
    }
    fornecedorData[forn].totalValor += c.valor || 0;
    if (c.orgao) fornecedorData[forn].orgaos.add(c.orgao);
    grandTotal += c.valor || 0;
  }

  for (const [forn, data] of Object.entries(fornecedorData)) {
    if (data.totalValor <= 0) continue;
    // Filter out entries where supplier name = organ name (public entities)
    if (data.orgaos.size === 1 && data.orgaos.has(data.nome)) continue;

    const concentracaoOrgaos = data.orgaos.size === 1 ? 100 : Math.max(0, 100 - data.orgaos.size * 15);
    const participacao = grandTotal > 0 ? (data.totalValor / grandTotal) * 100 : 0;

    const dependencia = Math.min(100, Math.round(
      concentracaoOrgaos * 0.6 + Math.min(participacao * 5, 40)
    ));

    scores.push({
      entidade_tipo: "fornecedor",
      entidade_nome: data.nome,
      entidade_id: forn,
      tipo_score: "dependencia_publica",
      valor: dependencia,
      componentes: { totalValor: data.totalValor, numOrgaos: data.orgaos.size, participacaoPct: participacao },
      periodo,
      ano,
    });
  }

  if (scores.length > 0) {
    for (let i = 0; i < scores.length; i += 100) {
      const chunk = scores.slice(i, i + 100);
      const { error } = await supabase.from("iscores").upsert(chunk, {
        onConflict: "entidade_tipo,entidade_nome,tipo_score,periodo",
      });
      if (error) console.error(`iScores upsert error (batch ${i}):`, error.message);
    }
  }

  return { computed: scores.length };
}

// ═══════════════════════════════════════════════════════════
// MARKET INSIGHTS — from orcamento_unificado + contratos_comprasgov
// ═══════════════════════════════════════════════════════════
async function computeInsights(
  supabase: ReturnType<typeof createClient>,
  contracts: ContractRecord[],
  budget: BudgetRecord[],
  periodo: string,
  ano: number
) {
  await supabase.from("market_insights").delete().eq("periodo", periodo);

  const insights: Array<{
    tipo_insight: string;
    descricao: string;
    orgao: string | null;
    fornecedor: string | null;
    cnpj_fornecedor: string | null;
    data_referencia: string;
    relevancia_score: number;
    dados_json: Record<string, unknown>;
    periodo: string;
  }> = [];

  const today = new Date().toISOString().split("T")[0];

  // ── Concentration alerts — from contratos_comprasgov ──
  const byOrgan: Record<string, Record<string, { cnpj: string; nome: string; valor: number }>> = {};
  for (const c of contracts) {
    const org = c.orgao || "Outros";
    const forn = c.cnpj_fornecedor;
    if (!byOrgan[org]) byOrgan[org] = {};
    if (!byOrgan[org][forn]) byOrgan[org][forn] = { cnpj: forn, nome: c.nome_fornecedor, valor: 0 };
    byOrgan[org][forn].valor += c.valor || 0;
  }

  for (const [orgao, fornecedores] of Object.entries(byOrgan)) {
    const entries = Object.values(fornecedores).sort((a, b) => b.valor - a.valor);
    const totalValor = entries.reduce((s, e) => s + e.valor, 0);
    if (totalValor <= 0 || entries.length < 2) continue;

    const topShare = (entries[0].valor / totalValor) * 100;
    if (topShare > 40) {
      insights.push({
        tipo_insight: "concentracao_fornecedor",
        descricao: `Fornecedor "${entries[0].nome}" detém ${topShare.toFixed(1)}% dos contratos em ${orgao}`,
        orgao,
        fornecedor: entries[0].nome,
        cnpj_fornecedor: entries[0].cnpj,
        data_referencia: today,
        relevancia_score: Math.min(100, Math.round(topShare)),
        dados_json: { topShare, totalValor, fornecedor: entries[0].nome, cnpj: entries[0].cnpj },
        periodo,
      });
    }
  }

  // ── Budget execution alerts — from orcamento_unificado ──
  // Uses empenhado as base (since API doesn't provide dotação)
  for (const b of budget) {
    const empenhado = b.empenhado_total || 0;
    if (empenhado <= 0) continue;
    const pago = b.pago_total || 0;
    const execRate = (pago / empenhado) * 100;

    if (execRate < 10 && empenhado > 1e8) {
      insights.push({
        tipo_insight: "oportunidade_orcamentaria",
        descricao: `${b.orgao_nome} pagou apenas ${execRate.toFixed(2)}% do empenhado (${formatCompact(empenhado - pago)} a pagar)`,
        orgao: b.orgao_nome,
        fornecedor: null,
        cnpj_fornecedor: null,
        data_referencia: today,
        relevancia_score: Math.min(100, Math.round(100 - execRate)),
        dados_json: { empenhado, pago, execRate },
        periodo,
      });
    }
  }

  if (insights.length > 0) {
    const { error } = await supabase.from("market_insights").insert(insights);
    if (error) console.error("Insights insert error:", error.message);
  }

  return { generated: insights.length };
}

// ═══════════════════════════════════════════════════════════
// EXECUTIVE REPORT — from orcamento_unificado + contratos_comprasgov
// ═══════════════════════════════════════════════════════════
async function generateExecutiveReport(
  supabase: ReturnType<typeof createClient>,
  contracts: ContractRecord[],
  budget: BudgetRecord[],
  periodo: string,
  ano: number
) {
  // Budget totals from orcamento_unificado (using empenhado as base, API has no dotação)
  const totalEmpenhado = budget.reduce((s, b) => s + (b.empenhado_total || 0), 0);
  const totalLiquidado = budget.reduce((s, b) => s + (b.liquidado_total || 0), 0);
  const totalPago = budget.reduce((s, b) => s + (b.pago_total || 0), 0);

  // Top organs by empenhado — from orcamento_unificado
  const topOrgans = [...budget]
    .sort((a, b) => (b.empenhado_total || 0) - (a.empenhado_total || 0))
    .slice(0, 10)
    .map(b => ({ orgao: b.orgao_nome, empenhado: b.empenhado_total, liquidado: b.liquidado_total, pago: b.pago_total }));

  // Top suppliers — from contratos_comprasgov
  const fornMap: Record<string, { nome: string; total: number }> = {};
  let totalContratos = 0;
  for (const c of contracts) {
    const key = c.cnpj_fornecedor;
    if (!fornMap[key]) fornMap[key] = { nome: c.nome_fornecedor, total: 0 };
    fornMap[key].total += c.valor || 0;
    totalContratos += c.valor || 0;
  }
  const topSuppliers = Object.entries(fornMap)
    .map(([cnpj, d]) => ({ cnpj, nome: d.nome, valor: d.total }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);

  // Pending payment by organ (empenhado - pago)
  const pendingByOrgan = [...budget]
    .map(b => ({
      orgao: b.orgao_nome,
      aPagar: Math.max(0, (b.empenhado_total || 0) - (b.pago_total || 0)),
      empenhado: b.empenhado_total || 0,
    }))
    .sort((a, b) => b.aPagar - a.aPagar)
    .slice(0, 10);

  const execRate = totalEmpenhado > 0 ? (totalPago / totalEmpenhado * 100) : 0;

  const resumo = `Relatório Executivo ${periodo}: Total empenhado R$ ${formatCompact(totalEmpenhado)}, liquidado R$ ${formatCompact(totalLiquidado)}, pago R$ ${formatCompact(totalPago)} (${execRate.toFixed(1)}% execução). ${contracts.length} contratos PNCP processados (R$ ${formatCompact(totalContratos)}). Top órgão: ${topOrgans[0]?.orgao || "N/A"}.`;

  const reportData = {
    totalEmpenhado,
    totalLiquidado,
    totalPago,
    totalContratos,
    numContratos: contracts.length,
    execRate,
    topOrgans,
    topSuppliers,
    pendingByOrgan,
  };

  const { error } = await supabase.from("executive_reports").upsert(
    {
      mes_referencia: periodo,
      ano,
      resumo_gerado: resumo,
      dados_json: reportData,
      status: "gerado",
    },
    { onConflict: "mes_referencia,ano" }
  );
  if (error) console.error("Report upsert error:", error.message);

  return { generated: true, resumo };
}

function formatCompact(value: number): string {
  if (value >= 1e12) return `${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(2);
}
