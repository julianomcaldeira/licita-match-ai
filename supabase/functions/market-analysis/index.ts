import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { analysisType, filters, userQuestion } = await req.json();

    const dateFrom = filters?.dateFrom || "2023-01-01";
    const dateTo = filters?.dateTo || new Date().toISOString().split("T")[0];
    const uf = filters?.uf || null;

    const [salesTotals, topWinners, topBuyers, monthlySales, totals, recentLicitacoes] = await Promise.all([
      supabase.rpc("analytics_sales_totals", { p_date_from: dateFrom, p_date_to: dateTo }),
      supabase.rpc("analytics_top_winners", { p_date_from: dateFrom, p_date_to: dateTo, p_limit: 15 }),
      supabase.rpc("analytics_top_buyers", { p_date_from: dateFrom, p_date_to: dateTo, p_limit: 15 }),
      supabase.rpc("analytics_monthly_sales", { p_date_from: dateFrom, p_date_to: dateTo }),
      supabase.rpc("analytics_totals", { p_date_from: dateFrom, p_date_to: dateTo }),
      supabase
        .from("licitacoes")
        .select("orgao, objeto, modalidade, valor_estimado, valor_homologado, uf, situacao, data_publicacao")
        .gte("data_publicacao", dateFrom)
        .lte("data_publicacao", dateTo)
        .order("valor_homologado", { ascending: false, nullsFirst: false })
        .limit(30),
    ]);

    const salesData = salesTotals.data?.[0] || {};
    const totalsData = totals.data?.[0] || {};
    const winnersData = topWinners.data || [];
    const buyersData = topBuyers.data || [];
    const monthlyData = monthlySales.data || [];
    const recentData = recentLicitacoes.data || [];

    const marketContext = `
## DADOS DE MERCADO DE LICITAÇÕES PÚBLICAS BRASILEIRAS
Período: ${dateFrom} a ${dateTo}${uf ? ` | UF: ${uf}` : ""}

### RESUMO GERAL
- Total de vendas (contratos): R$ ${(salesData.total_sales || 0).toLocaleString("pt-BR")}
- Total de contratos: ${(salesData.total_contracts || 0).toLocaleString("pt-BR")}
- Empresas participantes (CNPJs distintos): ${(totalsData.total_empresas || 0).toLocaleString("pt-BR")}
- Órgãos compradores distintos: ${(totalsData.total_orgaos || 0).toLocaleString("pt-BR")}

### TOP 15 EMPRESAS VENCEDORAS
${winnersData.map((w: any, i: number) => `${i + 1}. ${w.razao_social} (CNPJ: ${w.cnpj || "N/I"}) — ${w.wins} vitórias, R$ ${(w.total_valor || 0).toLocaleString("pt-BR")}`).join("\n")}

### TOP 15 ÓRGÃOS COMPRADORES
${buyersData.map((b: any, i: number) => `${i + 1}. ${b.orgao} — ${b.purchases} compras, R$ ${(b.total_valor || 0).toLocaleString("pt-BR")}`).join("\n")}

### EVOLUÇÃO MENSAL DE VENDAS
${monthlyData.map((m: any) => `${m.month}: R$ ${(m.total_valor || 0).toLocaleString("pt-BR")} (${m.contract_count} contratos)`).join("\n")}

### AMOSTRA DAS 30 MAIORES LICITAÇÕES RECENTES
${recentData.map((l: any, i: number) => `${i + 1}. [${l.uf || "?"}] ${l.orgao} — "${(l.objeto || "").substring(0, 120)}" | Est: R$ ${(l.valor_estimado || 0).toLocaleString("pt-BR")} | Hom: R$ ${(l.valor_homologado || 0).toLocaleString("pt-BR")} | ${l.modalidade || "?"} | ${l.situacao || "?"}`).join("\n")}
`;

    const analysisPrompts: Record<string, string> = {
      market_overview: "Faça uma análise geral e estratégica do mercado de licitações com base nos dados.",
      competitive: "Analise o cenário competitivo: quais empresas dominam, market share e padrões de vitória.",
      regional: "Faça uma análise regional: quais UFs movimentam mais, onde há oportunidades subexploradas.",
      trend: "Analise tendências temporais: crescimento/queda, sazonalidade e evolução de valores.",
      opportunity: "Identifique oportunidades: nichos com pouca competição e segmentos em crescimento.",
      custom: userQuestion || "Faça uma análise completa desses dados de licitações públicas.",
    };

    const systemPrompt = `Você é um analista sênior de inteligência de mercado B2G (licitações públicas brasileiras).

REGRAS DE FORMATAÇÃO OBRIGATÓRIAS:
1. Comece SEMPRE com um resumo executivo de 2-3 linhas com os números mais importantes
2. Use seções com "## " (h2) e subseções com "### " (h3)
3. Use **negrito** para números, percentuais e nomes de empresas/órgãos
4. Use tabelas markdown quando comparar 3+ itens (ex: ranking de empresas)
5. Use listas numeradas para rankings e listas com bullet para insights
6. Cada seção deve ter no MÁXIMO 4-5 bullets — seja direto
7. Calcule e mostre: market share (%), ticket médio (R$), variação mensal (%), concentração
8. Termine com "## 🎯 Ações Recomendadas" com exatamente 3 ações concretas e específicas

REGRAS DE CONTEÚDO:
- Seja DIRETO e QUANTITATIVO — evite frases genéricas como "o mercado é dinâmico"
- Sempre compare: "A empresa X tem Y% do mercado, Z vezes mais que a 2ª colocada"
- Destaque anomalias e outliers — o que foge do padrão é o mais valioso
- Use emojis estratégicos: 📊 dados, 🏆 rankings, ⚠️ alertas, 💡 insights, 📈 crescimento, 📉 queda
- Formate valores monetários sempre como "R$ X,XX" com separador de milhar

Responda SEMPRE em português brasileiro.`;

    const userPrompt = `${analysisPrompts[analysisType] || analysisPrompts.custom}\n\n${marketContext}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos ao workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro no serviço de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });

  } catch (e) {
    console.error("market-analysis error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
