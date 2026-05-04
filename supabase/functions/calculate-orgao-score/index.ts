// Calcula score de "bom pagador" para órgãos públicos.
// Fontes:
//   1) Portal da Transparência - despesas/pagamento (chave PORTAL_TRANSPARENCIA_API_KEY)
//   2) SICONFI (Tesouro) - dívida consolidada / RCL (público, sem chave)
//   3) Contratos internos da plataforma (atraso médio)
//
// Pode rodar em 2 modos:
//   - { cnpj: "12345678000190" } → calcula 1 órgão (on-demand pela UI)
//   - { mode: "batch", limit: 200 } → calcula em lote (cron diário)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PT_API_KEY = Deno.env.get("PORTAL_TRANSPARENCIA_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const onlyDigits = (s: string | null | undefined) =>
  (s || "").replace(/\D/g, "");

function classify(score: number): string {
  if (score >= 950) return "AAA";
  if (score >= 900) return "AA";
  if (score >= 850) return "A";
  if (score >= 800) return "BBB";
  if (score >= 700) return "BB";
  if (score >= 600) return "B";
  if (score >= 500) return "CCC";
  if (score >= 400) return "CC";
  if (score >= 300) return "C";
  return "D";
}

// ---------- Fonte 1: Portal da Transparência ----------
async function fetchPortalPagamentos(cnpj: string, ano: number) {
  // /despesas/por-orgao retorna empenhado/liquidado/pago por órgão e ano
  // doc: https://api.portaldatransparencia.gov.br/swagger-ui.html
  const url = `https://api.portaldatransparencia.gov.br/api-de-dados/despesas/por-orgao?ano=${ano}&codigoOrgao=${cnpj}&pagina=1`;
  try {
    const r = await fetch(url, {
      headers: { "chave-api-dados": PT_API_KEY, accept: "application/json" },
    });
    if (!r.ok) {
      // tenta endpoint alternativo (por favorecido) se o 1o não funcionar
      return null;
    }
    const arr = await r.json();
    if (!Array.isArray(arr) || arr.length === 0) return null;
    let empenhado = 0, liquidado = 0, pago = 0;
    for (const x of arr) {
      empenhado += Number(x.empenhado || x.valorEmpenhado || 0);
      liquidado += Number(x.liquidado || x.valorLiquidado || 0);
      pago += Number(x.pago || x.valorPago || 0);
    }
    return { empenhado, liquidado, pago, qtd: arr.length };
  } catch {
    return null;
  }
}

// ---------- Fonte 2: SICONFI (saúde fiscal) ----------
async function fetchSiconfi(cnpj: string, ano: number) {
  // RGF - Anexo 2 (Dívida Consolidada Líquida / RCL) - exercício anual
  // API pública: https://apidatalake.tesouro.gov.br/docs/siconfi/
  const url = `https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rgf?an_exercicio=${ano}&nr_periodicidade=3&id_periodo=3&co_tipo_demonstrativo=RGF&id_ente=${cnpj}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    if (!data?.items?.length) return null;
    let dcl = 0, rcl = 0;
    for (const item of data.items) {
      const conta = String(item.conta || "").toUpperCase();
      const valor = Number(item.valor || 0);
      if (conta.includes("DÍVIDA CONSOLIDADA LÍQUIDA")) dcl += valor;
      if (conta.includes("RECEITA CORRENTE LÍQUIDA")) rcl += valor;
    }
    if (rcl <= 0) return null;
    return { dcl, rcl, pct: (dcl / rcl) * 100 };
  } catch {
    return null;
  }
}

// ---------- Fonte 3: contratos internos ----------
async function fetchContratosInternos(supabase: any, cnpj: string) {
  const { data } = await supabase
    .from("contratos")
    .select("data_assinatura, data_vigencia_fim, valor_inicial, valor_final, situacao")
    .eq("cnpj_orgao", cnpj)
    .limit(500);
  if (!data || data.length === 0) return null;
  let total = 0, em_dia = 0, atraso_total = 0, com_data = 0;
  const hoje = new Date();
  const TOLERANCIA_DIAS = 90;
  for (const c of data) {
    total++;
    const fim = c.data_vigencia_fim ? new Date(c.data_vigencia_fim) : null;
    const sit = String(c.situacao || "").toLowerCase();
    const problema = sit.includes("rescind") || sit.includes("anulad") || sit.includes("suspens") || sit.includes("inadimpl");
    if (problema) {
      atraso_total += 180; com_data++;
    } else if (sit.includes("encerrado") || sit.includes("conclu") || sit.includes("vigente") || sit.includes("ativo")) {
      em_dia++;
    } else if (fim && (hoje.getTime() - fim.getTime()) / 86400000 > TOLERANCIA_DIAS) {
      const dias = Math.floor((hoje.getTime() - fim.getTime()) / 86400000) - TOLERANCIA_DIAS;
      atraso_total += dias;
      com_data++;
    } else {
      em_dia++;
    }
  }
  return {
    total,
    pct_em_dia: (em_dia / total) * 100,
    atraso_medio: com_data > 0 ? atraso_total / com_data : 0,
  };
}

async function calculateForOrgao(supabase: any, cnpj: string, nome: string, uf: string | null) {
  const ano = new Date().getFullYear();
  const fontes: string[] = [];

  // Roda em paralelo
  const [pt, sf, ct] = await Promise.all([
    fetchPortalPagamentos(cnpj, ano - 1).catch(() => null),
    fetchSiconfi(cnpj, ano - 1).catch(() => null),
    fetchContratosInternos(supabase, cnpj).catch(() => null),
  ]);

  // ----- Score componente 1: PAGAMENTO (peso 50%) -----
  let scorePagamento = 0;
  let pctPago = 0;
  if (pt && pt.empenhado > 0) {
    fontes.push("portal_transparencia");
    pctPago = (pt.pago / pt.empenhado) * 100;
    // 100% pago → 500pts; 50% → 200pts; 0% → 0pts
    scorePagamento = Math.min(500, Math.round((pctPago / 100) * 500));
  }

  // ----- Score componente 2: FISCAL (peso 30%) -----
  let scoreFiscal = 0;
  let pctDivida = 0;
  if (sf) {
    fontes.push("siconfi");
    pctDivida = sf.pct;
    // <60% (limite LRF) → 300pts; 60-100% → degrade; >120% → 0
    if (pctDivida < 60) scoreFiscal = 300;
    else if (pctDivida < 120) scoreFiscal = Math.round(300 * (1 - (pctDivida - 60) / 60));
    else scoreFiscal = 0;
  }

  // ----- Score componente 3: EXECUÇÃO INTERNA (peso 20%) -----
  let scoreExecucao = 0;
  let pctEmDia = 0;
  let atrasoMedio = 0;
  if (ct && ct.total >= 3) {
    fontes.push("contratos_internos");
    pctEmDia = ct.pct_em_dia;
    atrasoMedio = ct.atraso_medio;
    scoreExecucao = Math.round((pctEmDia / 100) * 200);
  }

  // Normaliza pelo peso das fontes disponíveis (se faltam fontes públicas,
  // o score interno representa 100% do que conseguimos avaliar).
  const pesoMax = (fontes.includes("portal_transparencia") ? 500 : 0)
                + (fontes.includes("siconfi") ? 300 : 0)
                + (fontes.includes("contratos_internos") ? 200 : 0);
  const somaBruta = scorePagamento + scoreFiscal + scoreExecucao;
  const scoreTotal = pesoMax > 0 ? Math.round((somaBruta / pesoMax) * 1000) : 0;
  const classificacao = fontes.length === 0 ? "SD" : classify(scoreTotal);

  const row = {
    cnpj_orgao: cnpj,
    nome_orgao: nome,
    uf,
    total_empenhado: pt?.empenhado || 0,
    total_liquidado: pt?.liquidado || 0,
    total_pago: pt?.pago || 0,
    qtd_pagamentos: pt?.qtd || 0,
    pct_pago_sobre_empenhado: pctPago,
    receita_corrente_liquida: sf?.rcl || null,
    divida_consolidada_liquida: sf?.dcl || null,
    pct_divida_rcl: pctDivida,
    qtd_contratos_analisados: ct?.total || 0,
    atraso_medio_dias: atrasoMedio,
    pct_contratos_em_dia: pctEmDia,
    score_numerico: scoreTotal,
    score_classificacao: classificacao,
    score_pagamento: scorePagamento,
    score_fiscal: scoreFiscal,
    score_execucao: scoreExecucao,
    fontes_utilizadas: fontes,
    ano_referencia: ano - 1,
    calculado_em: new Date().toISOString(),
    observacoes: fontes.length === 0 ? "Sem dados disponíveis nas fontes públicas" : null,
  };

  await supabase.from("orgaos_score").upsert(row, { onConflict: "cnpj_orgao" });
  return row;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!PT_API_KEY) {
    return new Response(JSON.stringify({ error: "PORTAL_TRANSPARENCIA_API_KEY missing" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: any = {};
  try { body = await req.json(); } catch {}

  // Modo 1: 1 órgão sob demanda
  if (body.cnpj) {
    const cnpj = onlyDigits(body.cnpj);
    if (cnpj.length !== 14) {
      return new Response(JSON.stringify({ error: "CNPJ inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const result = await calculateForOrgao(
      supabase, cnpj, body.nome || cnpj, body.uf || null
    );
    return new Response(JSON.stringify({ ok: true, score: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Modo 2: lote (cron diário) — pega top órgãos por nº de licitações
  const limit = Math.min(Number(body.limit) || 100, 300);
  const { data: orgaos } = await supabase
    .from("licitacoes")
    .select("orgao, uf, raw_json")
    .not("raw_json", "is", null)
    .limit(limit * 5);

  if (!orgaos) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Extrai CNPJ único do raw_json
  const seen = new Set<string>();
  const queue: { cnpj: string; nome: string; uf: string | null }[] = [];
  for (const l of orgaos) {
    const cnpj = onlyDigits(l.raw_json?.orgaoEntidade?.cnpj);
    if (cnpj.length === 14 && !seen.has(cnpj)) {
      seen.add(cnpj);
      queue.push({ cnpj, nome: l.orgao, uf: l.uf });
      if (queue.length >= limit) break;
    }
  }

  let ok = 0, fail = 0;
  for (const item of queue) {
    try {
      await calculateForOrgao(supabase, item.cnpj, item.nome, item.uf);
      ok++;
    } catch (e) {
      console.error("score fail", item.cnpj, e);
      fail++;
    }
    // pequena espera para não estourar rate-limit do Portal (90 req/min)
    await new Promise((r) => setTimeout(r, 700));
  }

  return new Response(JSON.stringify({ ok: true, processed: ok, failed: fail, total: queue.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
