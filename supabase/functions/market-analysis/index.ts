// market-analysis — agente IA com tool-calling
// Consulta dinamicamente dados oficiais (PNCP, Portal da Transparência, score de órgãos,
// CEIS/CNEP) e responde em PT-BR com citações de fonte.
//
// Compatível com chamada legada (analysisType + filters) e com nova chamada
// { question, period_months, uf, history? } -> JSON { answer, toolsUsed, sources }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const rateLimits = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(userId: string, max = 20, windowMs = 3600000): boolean {
  const now = Date.now();
  const entry = rateLimits.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(userId, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

async function authenticateUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "",
    { global: { headers: { Authorization: authHeader } } }
  );
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) return null;
  return { userId: data.claims.sub as string };
}

// ---------- TOOL DEFINITIONS (OpenAI-compatible) ----------
const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_market_overview",
      description:
        "Retorna KPIs agregados do mercado de licitações no período: total de vendas, total de contratos, nº de empresas e órgãos distintos, e evolução mensal. Fonte: PNCP + Portal da Transparência (consolidado).",
      parameters: {
        type: "object",
        properties: {
          period_months: { type: "integer", description: "Janela em meses retroativos. Padrão 6.", default: 6 },
          uf: { type: "string", description: "UF (ex: SP). Vazio = todas." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_winners",
      description:
        "Top empresas vencedoras no período (com CNPJ, nº de vitórias e valor total). Fonte: PNCP (resultados/homologações).",
      parameters: {
        type: "object",
        properties: {
          period_months: { type: "integer", default: 6 },
          uf: { type: "string" },
          limit: { type: "integer", default: 15 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_buyers",
      description:
        "Top órgãos compradores no período (nome do órgão, nº de compras, valor total). Fonte: PNCP.",
      parameters: {
        type: "object",
        properties: {
          period_months: { type: "integer", default: 6 },
          uf: { type: "string" },
          limit: { type: "integer", default: 15 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_licitacoes",
      description:
        "Busca licitações específicas por palavra-chave no objeto, órgão, vencedor, UF, situação ou modalidade. Use para responder perguntas pontuais (ex: 'licitações de impressoras na UFRJ', 'todas as licitações ganhas pela TOTVS'). Retorna no máximo 25 resultados com link oficial PNCP. Fonte: PNCP.",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "Texto livre buscado no objeto da licitação." },
          orgao: { type: "string", description: "Filtra por nome (ou parte) do órgão." },
          vencedor: { type: "string", description: "Filtra por razão social ou CNPJ do vencedor." },
          uf: { type: "string" },
          situacao: { type: "string", description: "Ex: 'Em Andamento', 'Homologada', 'Cancelada'." },
          modalidade: { type: "string", description: "Ex: 'Pregão', 'Concorrência'." },
          period_months: { type: "integer", description: "Janela retroativa em meses. Padrão 12.", default: 12 },
          limit: { type: "integer", default: 15 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_orgao_score",
      description:
        "Score de bom-pagador (AAA-D) e indicadores fiscais oficiais de um órgão público (cnpj exato preferido). Inclui % pago/empenhado, atraso médio, dívida/RCL. Fontes: Portal da Transparência (execução), SICONFI (fiscal) e dados internos.",
      parameters: {
        type: "object",
        properties: {
          cnpj: { type: "string", description: "CNPJ do órgão (apenas dígitos)." },
          orgao_nome: { type: "string", description: "Se não souber o CNPJ, passe parte do nome — buscamos o melhor match." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_vencedores_sancionados",
      description:
        "Lista vencedores recentes que estão na lista de empresas sancionadas (CEIS/CNEP). Fonte: Portal da Transparência (sanções).",
      parameters: {
        type: "object",
        properties: { limit: { type: "integer", default: 15 } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_contratos_recentes_orgao",
      description:
        "Top órgãos por volume contratado no período (contratos formalizados). Fonte: Portal da Transparência.",
      parameters: {
        type: "object",
        properties: {
          period_months: { type: "integer", default: 6 },
          limit: { type: "integer", default: 10 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_contratos",
      description:
        "Busca contratos formalizados (texto livre no objeto, CNPJ do fornecedor ou do órgão). Útil para 'todos os contratos da empresa X', 'contratos de TI no Ministério Y'. Fonte: Portal da Transparência (contratos).",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "Texto buscado no objeto do contrato." },
          fornecedor_cnpj: { type: "string", description: "CNPJ do fornecedor (apenas dígitos)." },
          orgao_cnpj: { type: "string", description: "CNPJ do órgão contratante (apenas dígitos)." },
          orgao_nome: { type: "string", description: "Parte do nome do órgão." },
          period_months: { type: "integer", default: 12 },
          limit: { type: "integer", default: 20 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_sancionadas",
      description:
        "Busca direta na lista de empresas/pessoas sancionadas (CEIS, CNEP, CEPIM, Inidôneas-TCU). Filtre por nome, CNPJ ou tipo de sanção. Fonte: Portal da Transparência — Cadastro de Sanções.",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "Nome (ou parte) da empresa/pessoa." },
          cnpj_cpf: { type: "string", description: "CNPJ/CPF (apenas dígitos)." },
          tipo_cadastro: { type: "string", description: "CEIS, CNEP, CEPIM ou INIDONEAS." },
          limit: { type: "integer", default: 20 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_diarios_oficiais",
      description:
        "Busca trechos em Diários Oficiais municipais (Querido Diário, +5500 municípios). Útil para encontrar publicações de homologações, contratos, dispensas e atos administrativos. Fonte: Querido Diário (Open Knowledge Brasil).",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "Texto buscado no trecho do diário." },
          uf: { type: "string" },
          territory_name: { type: "string", description: "Nome do município." },
          period_months: { type: "integer", default: 6 },
          limit: { type: "integer", default: 15 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_cnpj_receita",
      description:
        "Consulta cadastro oficial de um CNPJ direto na Receita Federal (razão social, situação cadastral, CNAEs, sócios, endereço, capital social). Use quando o usuário citar uma empresa por nome ou CNPJ e precisar de dados cadastrais. Fonte: Receita Federal via BrasilAPI (público).",
      parameters: {
        type: "object",
        properties: {
          cnpj: { type: "string", description: "CNPJ (com ou sem máscara)." },
        },
        required: ["cnpj"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_empresa_perfil",
      description:
        "Perfil consolidado de uma empresa fornecedora a partir do CNPJ: total de vitórias e valor em licitações (PNCP), contratos formalizados (Portal da Transparência) e eventuais sanções (CEIS/CNEP). Use quando o usuário quiser entender o histórico de uma empresa específica.",
      parameters: {
        type: "object",
        properties: {
          cnpj: { type: "string", description: "CNPJ do fornecedor (apenas dígitos)." },
          period_months: { type: "integer", default: 24 },
        },
        required: ["cnpj"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_orgaos_score",
      description:
        "Compara o score de bom-pagador (AAA-D) e indicadores fiscais de vários órgãos lado a lado. Use para perguntas como 'compare o histórico de pagamento entre X, Y e Z'. Fontes: Portal da Transparência + SICONFI + dados internos.",
      parameters: {
        type: "object",
        properties: {
          orgaos: {
            type: "array",
            description: "Lista de nomes ou CNPJs (até 5).",
            items: { type: "string" },
          },
        },
        required: ["orgaos"],
      },
    },
  },
];

// ---------- TOOL EXECUTORS ----------
function fmtMoney(v: any) {
  const n = Number(v) || 0;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function dateRange(period_months: number) {
  const m = Math.max(1, Math.min(60, period_months || 6));
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - m);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

async function execTool(
  supabase: any,
  name: string,
  args: any,
  globalUf?: string,
): Promise<{ content: string; summary: string; sources: { label: string; url?: string }[] }> {
  const uf = args.uf || globalUf || null;
  const sources: { label: string; url?: string }[] = [];

  try {
    switch (name) {
      case "get_market_overview": {
        const { from, to } = dateRange(args.period_months ?? 6);
        const [tot, totals, monthly] = await Promise.all([
          supabase.rpc("analytics_sales_totals", { p_date_from: from, p_date_to: to }),
          supabase.rpc("analytics_totals", { p_date_from: from, p_date_to: to }),
          supabase.rpc("analytics_monthly_sales", { p_date_from: from, p_date_to: to }),
        ]);
        const t = tot.data?.[0] || {};
        const tt = totals.data?.[0] || {};
        sources.push({ label: "PNCP — Portal Nacional de Contratações Públicas", url: "https://pncp.gov.br" });
        return {
          summary: `Visão geral ${from}→${to}${uf ? ` (UF ${uf})` : ""}`,
          sources,
          content: JSON.stringify({
            periodo: { from, to, uf: uf || "BR" },
            total_vendas_brl: t.total_sales || 0,
            total_contratos: t.total_contracts || 0,
            empresas_distintas: tt.total_empresas || 0,
            orgaos_distintos: tt.total_orgaos || 0,
            evolucao_mensal: (monthly.data || []).map((m: any) => ({
              mes: m.month, valor: m.total_valor, contratos: m.contract_count,
            })),
          }),
        };
      }
      case "get_top_winners": {
        const { from, to } = dateRange(args.period_months ?? 6);
        const limit = Math.min(50, args.limit ?? 15);
        const r = await supabase.rpc("analytics_top_winners", { p_date_from: from, p_date_to: to, p_limit: limit });
        sources.push({ label: "PNCP — resultados de homologação", url: "https://pncp.gov.br" });
        return {
          summary: `Top ${limit} vencedores`,
          sources,
          content: JSON.stringify((r.data || []).map((w: any) => ({
            razao_social: w.razao_social, cnpj: w.cnpj, vitorias: w.wins, valor_total_brl: w.total_valor,
          }))),
        };
      }
      case "get_top_buyers": {
        const { from, to } = dateRange(args.period_months ?? 6);
        const limit = Math.min(50, args.limit ?? 15);
        const r = await supabase.rpc("analytics_top_buyers", { p_date_from: from, p_date_to: to, p_limit: limit });
        sources.push({ label: "PNCP", url: "https://pncp.gov.br" });
        return {
          summary: `Top ${limit} órgãos compradores`,
          sources,
          content: JSON.stringify((r.data || []).map((b: any) => ({
            orgao: b.orgao, compras: b.purchases, valor_total_brl: b.total_valor,
          }))),
        };
      }
      case "search_licitacoes": {
        const { from, to } = dateRange(args.period_months ?? 12);
        const limit = Math.min(25, args.limit ?? 15);
        const r = await supabase.rpc("search_licitacoes", {
          p_search: args.keyword || null,
          p_orgao: args.orgao || null,
          p_vencedor: args.vencedor || null,
          p_date_from: from,
          p_date_to: to,
          p_uf: uf,
          p_situacao: args.situacao || null,
          p_modalidade: args.modalidade || null,
          p_com_vencedor: false,
          p_sem_resultado: false,
          p_limit: limit,
          p_offset: 0,
        });
        sources.push({ label: "PNCP — busca de licitações", url: "https://pncp.gov.br/app/editais" });
        const rows = (r.data || []).slice(0, limit).map((l: any) => ({
          id_origem: l.id_origem || l.numero_controle_pncp,
          link_pncp: l.numero_controle_pncp ? `https://pncp.gov.br/app/editais/${l.numero_controle_pncp}` : null,
          orgao: l.orgao,
          uf: l.uf,
          objeto: (l.objeto || "").slice(0, 220),
          modalidade: l.modalidade,
          situacao: l.situacao,
          data_publicacao: l.data_publicacao,
          valor_estimado: l.valor_estimado,
          valor_homologado: l.valor_homologado,
        }));
        return {
          summary: `Busca: ${rows.length} licitação(ões)`,
          sources,
          content: JSON.stringify(rows),
        };
      }
      case "get_orgao_score": {
        let cnpj = (args.cnpj || "").replace(/\D/g, "");
        if (!cnpj && args.orgao_nome) {
          const f = await supabase
            .from("orgaos_score")
            .select("cnpj_orgao,nome_orgao")
            .ilike("nome_orgao", `%${args.orgao_nome}%`)
            .order("score_numerico", { ascending: false })
            .limit(1);
          cnpj = f.data?.[0]?.cnpj_orgao || "";
        }
        if (!cnpj) {
          return { summary: "Órgão não localizado", sources: [], content: JSON.stringify({ erro: "Não foi possível localizar o órgão pelo nome." }) };
        }
        const r = await supabase.rpc("get_orgao_score", { p_cnpj: cnpj });
        sources.push({ label: "Portal da Transparência — execução orçamentária", url: "https://portaldatransparencia.gov.br" });
        sources.push({ label: "SICONFI — Tesouro Nacional", url: "https://siconfi.tesouro.gov.br" });
        return {
          summary: `Score do órgão ${cnpj}`,
          sources,
          content: JSON.stringify(r.data?.[0] || { erro: "Sem score calculado." }),
        };
      }
      case "check_vencedores_sancionados": {
        const limit = Math.min(50, args.limit ?? 15);
        const r = await supabase.rpc("check_vencedores_sancionados", { p_limit: limit });
        sources.push({ label: "Portal da Transparência — CEIS/CNEP (sanções)", url: "https://portaldatransparencia.gov.br/sancoes" });
        return { summary: `${(r.data || []).length} vencedor(es) sancionado(s)`, sources, content: JSON.stringify(r.data || []) };
      }
      case "get_contratos_recentes_orgao": {
        const days = (args.period_months ?? 6) * 30;
        const limit = Math.min(50, args.limit ?? 10);
        const r = await supabase.rpc("contratos_top_orgaos", { p_days: days, p_limit: limit });
        sources.push({ label: "Portal da Transparência — contratos", url: "https://portaldatransparencia.gov.br/contratos" });
        return { summary: `Top órgãos por contratos (${days}d)`, sources, content: JSON.stringify(r.data || []) };
      }
      default:
        return { summary: "tool desconhecida", sources: [], content: JSON.stringify({ erro: `Tool ${name} não existe.` }) };
    }
  } catch (e: any) {
    console.error("tool error", name, e);
    return { summary: `erro em ${name}`, sources: [], content: JSON.stringify({ erro: e?.message || "falha" }) };
  }
}

const SYSTEM_PROMPT = `Você é um analista sênior de inteligência de mercado B2G (licitações públicas brasileiras) do produto **i-pesquisei**.

Sua função é responder perguntas do usuário consultando **dados oficiais do governo** via as ferramentas disponíveis. Nunca invente números — sempre chame as ferramentas necessárias antes de responder.

ESTRATÉGIA:
1. Identifique o que a pergunta pede (visão geral, busca específica, ranking, score de órgão, risco de sanção, regional, tendência, etc.).
2. Chame **uma ou mais ferramentas** para obter os dados. Combine ferramentas quando necessário (ex: top vencedores + sancionados; top órgãos + score do órgão).
3. Para perguntas específicas sobre uma empresa ou órgão, use \`search_licitacoes\` com o filtro \`vencedor\` ou \`orgao\` em vez de listar tudo.
4. Quando o usuário citar um órgão por nome, busque o score dele com \`get_orgao_score(orgao_nome=...)\`.
5. Não chame mais de 4 ferramentas por resposta. Pare quando tiver dados suficientes.

FORMATO DA RESPOSTA (markdown PT-BR):
- Comece com 1-2 linhas de resumo executivo direto.
- Use tabelas markdown para rankings e listas comparativas.
- Use **negrito** para nomes de empresas/órgãos e valores em R$.
- Quando citar uma licitação específica, inclua link: \`[Edital no PNCP](https://pncp.gov.br/app/editais/{numero_controle_pncp})\`.
- Termine com seção \`## 🎯 Recomendações\` com **exatamente 3** ações concretas.
- Termine com seção \`## 📚 Fontes\` listando as fontes oficiais consultadas (PNCP, Portal da Transparência, SICONFI, etc.).

REGRAS:
- Seja DIRETO e QUANTITATIVO. Sem frases genéricas.
- Sempre compare ("X tem Y% do mercado, Z× a 2ª colocada").
- Destaque outliers, anomalias e riscos (sancionados, baixo score de pagamento).
- Valores monetários sempre como "R$ 1.234.567" com separador de milhar.
- Se uma ferramenta retornar erro ou vazio, informe ao usuário e sugira uma pergunta alternativa.`;

interface ToolMeta { name: string; args: any; summary: string }

async function runAgent(opts: {
  apiKey: string;
  supabase: any;
  question: string;
  history: { role: "user" | "assistant"; content: string }[];
  uf?: string;
  period_months?: number;
}): Promise<{ answer: string; toolsUsed: ToolMeta[]; sources: { label: string; url?: string }[] }> {
  const { apiKey, supabase, question, history, uf, period_months } = opts;
  const messages: any[] = [
    { role: "system", content: SYSTEM_PROMPT + `\n\nFiltros do usuário: período=${period_months || 6} meses${uf ? `, UF=${uf}` : ""}.` },
  ];
  for (const m of history.slice(-6)) messages.push({ role: m.role, content: m.content });
  messages.push({ role: "user", content: question });

  const toolsUsed: ToolMeta[] = [];
  const allSources: { label: string; url?: string }[] = [];
  const seenSources = new Set<string>();

  for (let iter = 0; iter < 5; iter++) {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        tools: TOOLS,
        tool_choice: iter < 4 ? "auto" : "none",
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI gateway error", resp.status, t);
      if (resp.status === 429) throw new Error("Rate limit. Tente novamente em alguns minutos.");
      if (resp.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos ao workspace.");
      throw new Error("Falha no serviço de IA.");
    }

    const data = await resp.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error("Resposta vazia do modelo.");

    const toolCalls = msg.tool_calls || [];
    if (!toolCalls.length) {
      return { answer: msg.content || "(resposta vazia)", toolsUsed, sources: allSources };
    }

    // Push assistant tool-call message as-is
    messages.push(msg);

    // Execute tools in parallel
    const results = await Promise.all(toolCalls.map(async (tc: any) => {
      let parsedArgs: any = {};
      try { parsedArgs = JSON.parse(tc.function.arguments || "{}"); } catch { /* ignore */ }
      const out = await execTool(supabase, tc.function.name, parsedArgs, uf);
      toolsUsed.push({ name: tc.function.name, args: parsedArgs, summary: out.summary });
      for (const s of out.sources) {
        const k = s.label;
        if (!seenSources.has(k)) { seenSources.add(k); allSources.push(s); }
      }
      return { tool_call_id: tc.id, content: out.content };
    }));

    for (const r of results) {
      messages.push({ role: "tool", tool_call_id: r.tool_call_id, content: r.content });
    }
  }

  // Forced final answer if loop exceeded
  return { answer: "Não consegui finalizar a análise — muitas iterações. Tente uma pergunta mais específica.", toolsUsed, sources: allSources };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = await authenticateUser(req);
    if (!auth) return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!checkRateLimit(auth.userId, 20, 3600000)) {
      return new Response(JSON.stringify({ error: "Limite de 20 perguntas/hora atingido. Tente mais tarde." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada.");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json();
    const question: string = body.question || body.userQuestion || "";
    const history = Array.isArray(body.history) ? body.history : (Array.isArray(body.conversationHistory) ? body.conversationHistory : []);
    const uf: string | undefined = body.uf || body.filters?.uf || undefined;
    const period_months: number = body.period_months || body.filters?.period || 6;

    if (!question.trim()) {
      return new Response(JSON.stringify({ error: "Pergunta vazia." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = await runAgent({ apiKey, supabase, question, history, uf, period_months });
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("market-analysis error:", e);
    const msg = e?.message || "Erro interno.";
    const status = msg.includes("Rate") ? 429 : msg.includes("Crédito") ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
