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
  // NOTE: get_orgao_score removida — score de órgãos em revisão, indisponível.

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
  // NOTE: compare_orgaos_score removida — score de órgãos em revisão, indisponível.

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

// ---------- HELPERS DE OTIMIZAÇÃO (cache, roteador, validador, ficha) ----------
async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function normalizeQuestion(q: string) {
  return q.toLowerCase().trim().replace(/\s+/g, " ").replace(/[?!.,;]+$/g, "");
}

// 7. Roteador: expõe apenas o subconjunto de tools relevante à pergunta.
function pickToolsForQuestion(question: string, allTools: any[]) {
  const q = question.toLowerCase();
  const picked = new Set<string>();
  const add = (...names: string[]) => names.forEach(n => picked.add(n));

  if (/(empres|forneced|cnpj|razão social|razao social|perfil)/.test(q))
    add("lookup_cnpj_receita", "get_empresa_perfil", "search_sancionadas");
  if (/(órgão|orgao|prefeitura|ministério|ministerio|secretaria|comprador)/.test(q))
    add("get_top_buyers", "get_contratos_recentes_orgao");
  if (/(licitaç|edital|pregão|pregao|homolog)/.test(q))
    add("search_licitacoes");
  if (/(contrato|formaliz|assinatur)/.test(q))
    add("search_contratos", "get_contratos_recentes_orgao");
  if (/(sancion|ceis|cnep|inidône|inidone|risco)/.test(q))
    add("search_sancionadas", "check_vencedores_sancionados");
  if (/(diário|diario oficial|querido)/.test(q))
    add("search_diarios_oficiais");
  if (/(visão|visao|geral|mercado|panorama|top|ranking|maiores|principais|vencedor)/.test(q))
    add("get_market_overview", "get_top_winners", "get_top_buyers");

  // fallback: kit básico
  if (picked.size === 0) add("get_market_overview", "get_top_winners", "get_top_buyers", "search_licitacoes");

  return allTools.filter(t => picked.has(t.function.name));
}

// 2. Ficha de contexto: 1 RPC barato com KPIs do período/UF para injetar no prompt.
//    Reduz drasticamente o nº de tool-calls em perguntas amplas.
async function buildContextBriefing(supabase: any, period_months: number, uf?: string) {
  try {
    const { from, to } = dateRange(period_months);
    const [tot, totals, winners, buyers] = await Promise.all([
      supabase.rpc("analytics_sales_totals", { p_date_from: from, p_date_to: to }),
      supabase.rpc("analytics_totals", { p_date_from: from, p_date_to: to }),
      supabase.rpc("analytics_top_winners", { p_date_from: from, p_date_to: to, p_limit: 5 }),
      supabase.rpc("analytics_top_buyers", { p_date_from: from, p_date_to: to, p_limit: 5 }),
    ]);
    const t = tot.data?.[0] || {};
    const tt = totals.data?.[0] || {};
    const fmt = (n: any) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
    const wList = (winners.data || []).slice(0, 5).map((w: any, i: number) =>
      `  ${i + 1}. ${w.razao_social} (CNPJ ${w.cnpj}) — ${w.wins} vitórias, ${fmt(w.total_valor)}`).join("\n");
    const bList = (buyers.data || []).slice(0, 5).map((b: any, i: number) =>
      `  ${i + 1}. ${b.orgao} — ${b.purchases} compras, ${fmt(b.total_valor)}`).join("\n");
    return `\n\n--- DADOS PRÉ-CARREGADOS (período ${from} → ${to}${uf ? `, UF ${uf}` : ", BR"}) ---
KPIs gerais:
  - Total movimentado: ${fmt(t.total_sales)}
  - Total de contratos: ${(t.total_contracts || 0).toLocaleString("pt-BR")}
  - Empresas distintas: ${(tt.total_empresas || 0).toLocaleString("pt-BR")}
  - Órgãos distintos: ${(tt.total_orgaos || 0).toLocaleString("pt-BR")}

Top 5 vencedores:
${wList || "  (sem dados)"}

Top 5 órgãos compradores:
${bList || "  (sem dados)"}

Use estes dados como ponto de partida — só chame tools para aprofundar (ex.: detalhe de empresa específica, busca textual, sanções, comparação). Para perguntas de "visão geral" ou "top X", os dados acima já bastam.
--- FIM DADOS PRÉ-CARREGADOS ---`;
  } catch (e) {
    console.error("buildContextBriefing failed:", e);
    return "";
  }
}

// 6. Validador: extrai R$ valores e CNPJs do texto final e checa se aparecem
//    nos resultados das tools chamadas. Adiciona aviso se houver suspeita de invenção.
function validateAnswer(answer: string, toolResultsConcat: string): { ok: boolean; suspect: { cnpjs: string[]; values: string[] } } {
  const haystack = toolResultsConcat.replace(/\D/g, "");
  const haystackText = toolResultsConcat.toLowerCase();

  // Extrai CNPJs no texto (com ou sem máscara) — só dígitos
  const cnpjMatches = Array.from(answer.matchAll(/\b(\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}|\d{14})\b/g))
    .map(m => m[0].replace(/\D/g, ""))
    .filter(c => c.length === 14);
  const suspectCnpjs = Array.from(new Set(cnpjMatches.filter(c => !haystack.includes(c))));

  // Extrai valores em R$ (apenas a parte inteira, em milhar) — mantém só números >= 10.000 (mais relevantes)
  const valueMatches = Array.from(answer.matchAll(/R\$\s*([\d.,]+)/gi))
    .map(m => m[1].replace(/\./g, "").replace(",", ".").split(".")[0])
    .filter(v => v && Number(v) >= 10000);
  const suspectValues = Array.from(new Set(valueMatches.filter(v => {
    // tolera diferença pelos últimos 3 dígitos (arredondamento)
    return !haystack.includes(v) && !haystack.includes(v.slice(0, -3));
  })));

  // Ignora valores que aparecem como texto formatado também (ex.: "1.234.567")
  const suspectValuesFinal = suspectValues.filter(v => !haystackText.includes(Number(v).toLocaleString("pt-BR")));

  return {
    ok: suspectCnpjs.length === 0 && suspectValuesFinal.length === 0,
    suspect: { cnpjs: suspectCnpjs, values: suspectValuesFinal },
  };
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
      // case get_orgao_score removido — score em revisão, indisponível.

      case "check_vencedores_sancionados": {
        const limit = Math.min(50, args.limit ?? 15);
        const r = await supabase.rpc("check_vencedores_sancionados", { p_limit: limit });
        sources.push({ label: "Portal da Transparência — CEIS/CNEP (sanções)", url: "https://portaldatransparencia.gov.br/sancoes" });
        return { summary: `${(r.data || []).length} vencedor(es) sancionado(s)`, sources, content: JSON.stringify(r.data || []) };
      }
      case "search_contratos": {
        const { from, to } = dateRange(args.period_months ?? 12);
        const limit = Math.min(50, args.limit ?? 20);
        let q = supabase
          .from("contratos")
          .select("numero_contrato,orgao_nome,cnpj_orgao,fornecedor_nome,fornecedor_cnpj,objeto,valor_inicial,valor_final,data_assinatura,data_vigencia_fim,situacao,modalidade_compra")
          .gte("data_assinatura", from)
          .lte("data_assinatura", to)
          .order("data_assinatura", { ascending: false })
          .limit(limit);
        if (args.keyword) q = q.ilike("objeto", `%${args.keyword}%`);
        if (args.fornecedor_cnpj) q = q.eq("fornecedor_cnpj", args.fornecedor_cnpj.replace(/\D/g, ""));
        if (args.orgao_cnpj) q = q.eq("cnpj_orgao", args.orgao_cnpj.replace(/\D/g, ""));
        if (args.orgao_nome) q = q.ilike("orgao_nome", `%${args.orgao_nome}%`);
        const r = await q;
        sources.push({ label: "Portal da Transparência — contratos", url: "https://portaldatransparencia.gov.br/contratos" });
        return { summary: `${(r.data || []).length} contrato(s)`, sources, content: JSON.stringify(r.data || []) };
      }
      case "search_sancionadas": {
        const limit = Math.min(50, args.limit ?? 20);
        let q = supabase
          .from("empresas_sancionadas")
          .select("nome,cnpj_cpf,tipo_cadastro,tipo_sancao,orgao_sancionador,uf_orgao,data_inicio,data_fim,fundamentacao_legal")
          .order("data_inicio", { ascending: false, nullsFirst: false })
          .limit(limit);
        if (args.keyword) q = q.ilike("nome", `%${args.keyword}%`);
        if (args.cnpj_cpf) q = q.eq("cnpj_cpf", args.cnpj_cpf.replace(/\D/g, ""));
        if (args.tipo_cadastro) q = q.eq("tipo_cadastro", args.tipo_cadastro.toUpperCase());
        const r = await q;
        sources.push({ label: "Portal da Transparência — Cadastro de Sanções (CEIS/CNEP)", url: "https://portaldatransparencia.gov.br/sancoes" });
        return { summary: `${(r.data || []).length} sanção(ões)`, sources, content: JSON.stringify(r.data || []) };
      }
      case "search_diarios_oficiais": {
        const { from, to } = dateRange(args.period_months ?? 6);
        const limit = Math.min(50, args.limit ?? 15);
        let q = supabase
          .from("diarios_oficiais")
          .select("territory_name,state_code,publication_date,url,excerpt,is_extra_edition")
          .gte("publication_date", from)
          .lte("publication_date", to)
          .order("publication_date", { ascending: false })
          .limit(limit);
        if (args.keyword) q = q.ilike("excerpt", `%${args.keyword}%`);
        if (args.uf || uf) q = q.eq("state_code", (args.uf || uf).toUpperCase());
        if (args.territory_name) q = q.ilike("territory_name", `%${args.territory_name}%`);
        const r = await q;
        sources.push({ label: "Querido Diário — Open Knowledge Brasil", url: "https://queridodiario.ok.org.br" });
        return { summary: `${(r.data || []).length} publicação(ões) em diário oficial`, sources, content: JSON.stringify(r.data || []) };
      }
      case "lookup_cnpj_receita": {
        const cnpj = (args.cnpj || "").replace(/\D/g, "");
        if (cnpj.length !== 14) {
          return { summary: "CNPJ inválido", sources: [], content: JSON.stringify({ erro: "CNPJ deve ter 14 dígitos." }) };
        }
        try {
          const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { headers: { Accept: "application/json" } });
          if (!resp.ok) {
            return { summary: `Receita: HTTP ${resp.status}`, sources: [], content: JSON.stringify({ erro: `Receita Federal retornou ${resp.status}.` }) };
          }
          const data = await resp.json();
          const slim = {
            cnpj: data.cnpj,
            razao_social: data.razao_social,
            nome_fantasia: data.nome_fantasia,
            situacao_cadastral: data.descricao_situacao_cadastral,
            data_inicio_atividade: data.data_inicio_atividade,
            capital_social: data.capital_social,
            porte: data.porte,
            natureza_juridica: data.natureza_juridica,
            cnae_principal: `${data.cnae_fiscal} - ${data.cnae_fiscal_descricao}`,
            cnaes_secundarios: (data.cnaes_secundarios || []).slice(0, 5).map((c: any) => `${c.codigo} - ${c.descricao}`),
            endereco: `${data.logradouro || ""}, ${data.numero || ""} - ${data.bairro || ""} - ${data.municipio || ""}/${data.uf || ""}`,
            telefone: data.ddd_telefone_1,
            email: data.email,
            qsa: (data.qsa || []).slice(0, 10).map((s: any) => ({ nome: s.nome_socio, qualificacao: s.qualificacao_socio })),
          };
          sources.push({ label: "Receita Federal — Cadastro Nacional da Pessoa Jurídica (via BrasilAPI)", url: `https://brasilapi.com.br/api/cnpj/v1/${cnpj}` });
          return { summary: `Receita: ${slim.razao_social}`, sources, content: JSON.stringify(slim) };
        } catch (e: any) {
          return { summary: "Falha Receita", sources: [], content: JSON.stringify({ erro: e?.message || "falha" }) };
        }
      }
      case "get_empresa_perfil": {
        const cnpj = (args.cnpj || "").replace(/\D/g, "");
        if (cnpj.length !== 14) {
          return { summary: "CNPJ inválido", sources: [], content: JSON.stringify({ erro: "CNPJ deve ter 14 dígitos." }) };
        }
        const { from, to } = dateRange(args.period_months ?? 24);
        const [vit, contr, sanc] = await Promise.all([
          supabase.from("licitacao_vencedores")
            .select("razao_social,cnpj,valor_homologado,data_homologacao", { count: "exact" })
            .eq("cnpj", cnpj)
            .gte("data_homologacao", from)
            .lte("data_homologacao", to)
            .limit(500),
          supabase.from("contratos")
            .select("numero_contrato,orgao_nome,objeto,valor_inicial,valor_final,data_assinatura", { count: "exact" })
            .eq("fornecedor_cnpj", cnpj)
            .order("data_assinatura", { ascending: false })
            .limit(20),
          supabase.from("empresas_sancionadas")
            .select("nome,tipo_cadastro,tipo_sancao,orgao_sancionador,data_inicio,data_fim")
            .eq("cnpj_cpf", cnpj)
            .limit(20),
        ]);
        const vitorias = vit.data || [];
        const totalVit = vitorias.reduce((s: number, r: any) => s + (Number(r.valor_homologado) || 0), 0);
        const contratos = contr.data || [];
        const totalContr = contratos.reduce((s: number, r: any) => s + (Number(r.valor_final) || Number(r.valor_inicial) || 0), 0);
        sources.push({ label: "PNCP — homologações", url: "https://pncp.gov.br" });
        sources.push({ label: "Portal da Transparência — contratos", url: "https://portaldatransparencia.gov.br/contratos" });
        if ((sanc.data || []).length) sources.push({ label: "Portal da Transparência — Sanções (CEIS/CNEP)", url: "https://portaldatransparencia.gov.br/sancoes" });
        return {
          summary: `Perfil ${cnpj}`,
          sources,
          content: JSON.stringify({
            cnpj,
            periodo: { from, to },
            licitacoes: { total_vitorias: vit.count ?? vitorias.length, valor_total_brl: totalVit, razao_social: vitorias[0]?.razao_social || null },
            contratos_pt: { total: contr.count ?? contratos.length, valor_total_brl: totalContr, recentes: contratos.slice(0, 10) },
            sancoes: sanc.data || [],
          }),
        };
      }
      case "compare_orgaos_score": {
        const inputs: string[] = (args.orgaos || []).slice(0, 5);
        const results = await Promise.all(inputs.map(async (it: string) => {
          let cnpj = it.replace(/\D/g, "");
          if (cnpj.length !== 14) {
            const f = await supabase.from("orgaos_score").select("cnpj_orgao,nome_orgao")
              .ilike("nome_orgao", `%${it}%`).order("score_numerico", { ascending: false }).limit(1);
            cnpj = f.data?.[0]?.cnpj_orgao || "";
          }
          if (!cnpj) return { input: it, erro: "não localizado" };
          const r = await supabase.rpc("get_orgao_score", { p_cnpj: cnpj });
          return { input: it, score: r.data?.[0] || null };
        }));
        sources.push({ label: "Portal da Transparência — execução orçamentária", url: "https://portaldatransparencia.gov.br" });
        sources.push({ label: "SICONFI — Tesouro Nacional", url: "https://siconfi.tesouro.gov.br" });
        return { summary: `Comparativo de ${results.length} órgão(s)`, sources, content: JSON.stringify(results) };
      }
      default:
        return { summary: "tool desconhecida", sources: [], content: JSON.stringify({ erro: `Tool ${name} não existe.` }) };
    }
  } catch (e: any) {
    console.error("tool error", name, e);
    return { summary: `erro em ${name}`, sources: [], content: JSON.stringify({ erro: e?.message || "falha" }) };
  }
}

const SYSTEM_PROMPT = `Você é um analista de inteligência de mercado B2G (licitações públicas brasileiras) do produto **i-pesquisei**.

REGRA DE OURO: NUNCA invente números, nomes, CNPJs, valores ou datas. Toda afirmação quantitativa precisa vir de uma ferramenta executada com sucesso. Se as ferramentas não trouxerem dados, diga isso explicitamente — não preencha lacunas com suposições.

FERRAMENTAS (escolha a mais adequada — não chame todas):
- Visão de mercado / rankings → get_market_overview, get_top_winners, get_top_buyers, get_contratos_recentes_orgao
- Empresa específica → lookup_cnpj_receita (cadastro) + get_empresa_perfil (vitórias/contratos/sanções)
- Órgão específico → get_orgao_score(orgao_nome=...) | comparar vários → compare_orgaos_score
- Licitação por palavra/órgão/vencedor → search_licitacoes
- Contratos formalizados → search_contratos
- Sanções (CEIS/CNEP) → search_sancionadas | risco em vencedores recentes → check_vencedores_sancionados
- Diários oficiais municipais → search_diarios_oficiais

ESTRATÉGIA:
1. Leia a pergunta e escolha 1–3 ferramentas que respondam diretamente. Só adicione mais se a pergunta exigir cruzamento (ex.: "principais vencedores que estão sancionados" → top_winners + check_vencedores_sancionados).
2. Para perguntas amplas ("visão geral"), uma única chamada (get_market_overview) costuma bastar.
3. Pare assim que tiver dados suficientes. Máximo prático: 4 ferramentas.
4. Se um filtro citado pelo usuário (UF, período) já foi passado, NÃO refaça a mesma chamada com filtros diferentes só por reflexo.

FORMATO (markdown PT-BR, conciso):
- 2–3 linhas de resumo executivo no topo.
- Tabelas markdown apenas quando há lista/ranking.
- **Negrito** em nomes próprios e valores em R$ ("R$ 1.234.567").
- Cite a fonte ENTRE PARÊNTESES ao final do parágrafo/linha quando o dado vier de uma fonte específica: (PNCP), (Portal da Transparência), (Receita Federal), (SICONFI), (Querido Diário), (CEIS/CNEP).
- Para uma licitação individual: \`[Ver no PNCP](https://pncp.gov.br/app/editais/{numero_controle_pncp})\`.
- Encerre com **## Recomendações** (2 a 4 bullets acionáveis). Não force exatamente 3 se não fizer sentido.
- Não repita a lista de fontes no final — a interface já mostra os links das fontes.

ESTILO:
- Direto, quantitativo, sem marketing nem floreios.
- Compare quando relevante ("X tem 32% — 2,5× a 2ª colocada").
- Destaque riscos: sancionadas, score baixo, situação cadastral irregular.
- Se uma ferramenta retornar vazio, diga "Sem registros para os filtros aplicados" e sugira refinar (período maior, remover UF, etc.).`;

interface ToolMeta { name: string; args: any; summary: string }

async function runAgent(opts: {
  apiKey: string;
  supabase: any;
  question: string;
  history: { role: "user" | "assistant"; content: string }[];
  uf?: string;
  period_months?: number;
}): Promise<{ answer: string; toolsUsed: ToolMeta[]; sources: { label: string; url?: string }[]; validation?: { ok: boolean; suspect: { cnpjs: string[]; values: string[] } } }> {
  const { apiKey, supabase, question, history, uf, period_months } = opts;

  // Passo 2 — Ficha de contexto pré-carregada (1 RPC barato)
  const briefing = await buildContextBriefing(supabase, period_months || 6, uf);

  // Passo 7 — Roteador: filtra ferramentas relevantes
  const tools = pickToolsForQuestion(question, TOOLS);

  const messages: any[] = [
    {
      role: "system",
      content:
        SYSTEM_PROMPT +
        `\n\nFiltros do usuário: período=${period_months || 6} meses${uf ? `, UF=${uf}` : ""}.` +
        briefing,
    },
  ];
  for (const m of history.slice(-6)) messages.push({ role: m.role, content: m.content });
  messages.push({ role: "user", content: question });

  const toolsUsed: ToolMeta[] = [];
  const allSources: { label: string; url?: string }[] = [];
  const seenSources = new Set<string>();
  const toolResultsConcat: string[] = [];

  // Roteamento híbrido de modelo
  const ql = question.toLowerCase();
  const COMPLEX_HINTS = [
    "compar", "cruz", "perfil", "sancion", "ceis", "cnep", "cnpj",
    "score", "risco", "domin", "concentr", "outlier", "anomal",
    " vs ", " versus ", "lado a lado", "histórico", "historico",
    "análise", "analise", "diagnóst", "diagnost", "investig",
  ];
  const isComplex =
    COMPLEX_HINTS.some(k => ql.includes(k)) ||
    question.length > 220 ||
    history.length >= 2;
  const MODELS = isComplex
    ? ["google/gemini-3-flash-preview", "openai/gpt-5-mini"]
    : ["google/gemini-3.1-flash-lite", "google/gemini-3-flash-preview"];
  let modelIdx = 0;

  for (let iter = 0; iter < 7; iter++) {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODELS[modelIdx],
        messages,
        tools,
        tool_choice: iter < 6 ? "auto" : "none",
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI gateway error", resp.status, MODELS[modelIdx], t);
      if ((resp.status >= 500 || resp.status === 400) && modelIdx < MODELS.length - 1) {
        modelIdx++;
        continue;
      }
      if (resp.status === 429) throw new Error("Rate limit. Tente novamente em alguns minutos.");
      if (resp.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos ao workspace.");
      throw new Error("Falha no serviço de IA.");
    }

    const data = await resp.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error("Resposta vazia do modelo.");

    const toolCalls = msg.tool_calls || [];
    if (!toolCalls.length) {
      let answer = msg.content || "(resposta vazia)";

      // Passo 6 — Validador anti-alucinação
      const validation = validateAnswer(answer, toolResultsConcat.join("\n") + "\n" + briefing);
      if (!validation.ok) {
        console.warn("market-analysis suspeita de invenção:", validation.suspect);
        const parts: string[] = [];
        if (validation.suspect.cnpjs.length) parts.push(`CNPJ(s) sem origem: ${validation.suspect.cnpjs.join(", ")}`);
        if (validation.suspect.values.length) parts.push(`Valor(es) sem origem: ${validation.suspect.values.map(v => `R$ ${Number(v).toLocaleString("pt-BR")}`).join(", ")}`);
        answer += `\n\n> ⚠️ **Aviso de validação:** alguns dados acima não foram localizados nas fontes consultadas (${parts.join("; ")}). Considere refinar a pergunta ou solicitar nova consulta.`;
      }

      return { answer, toolsUsed, sources: allSources, validation };
    }

    messages.push(msg);

    const results = await Promise.all(toolCalls.map(async (tc: any) => {
      let parsedArgs: any = {};
      try { parsedArgs = JSON.parse(tc.function.arguments || "{}"); } catch { /* ignore */ }
      const out = await execTool(supabase, tc.function.name, parsedArgs, uf);
      toolsUsed.push({ name: tc.function.name, args: parsedArgs, summary: out.summary });
      toolResultsConcat.push(out.content);
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

  return { answer: "Não consegui finalizar a análise — muitas iterações. Tente uma pergunta mais específica.", toolsUsed, sources: allSources };
}

async function logUsage(supabase: any, row: Record<string, unknown>) {
  try { await supabase.from("ai_usage_log").insert(row); } catch (e) { console.error("logUsage failed", e); }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const t0 = Date.now();
  let userId: string | null = null;
  let supabase: any = null;
  try {
    const auth = await authenticateUser(req);
    if (!auth) return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    userId = auth.userId;
    if (!checkRateLimit(auth.userId, 20, 3600000)) {
      return new Response(JSON.stringify({ error: "Limite de 20 perguntas/hora atingido. Tente mais tarde." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada.");
    supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json();
    const question: string = body.question || body.userQuestion || "";
    const history = Array.isArray(body.history) ? body.history : (Array.isArray(body.conversationHistory) ? body.conversationHistory : []);
    const uf: string | undefined = body.uf || body.filters?.uf || undefined;
    const period_months: number = body.period_months || body.filters?.period || 6;

    if (!question.trim()) {
      return new Response(JSON.stringify({ error: "Pergunta vazia." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const cacheKey = await sha256Hex(`${normalizeQuestion(question)}|p=${period_months}|uf=${uf || ""}`);
    if (history.length === 0) {
      const { data: cached } = await supabase
        .from("ai_query_cache")
        .select("response,hits")
        .eq("cache_key", cacheKey)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (cached?.response) {
        supabase.from("ai_query_cache").update({ hits: ((cached as any).hits || 0) + 1 }).eq("cache_key", cacheKey).then(() => {}, () => {});
        logUsage(supabase, { function_name: "market-analysis", model: "cache", user_id: userId, cached: true, duration_ms: Date.now() - t0, status: "success", metadata: { period_months, uf } });
        return new Response(JSON.stringify({ ...cached.response, cached: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const result = await runAgent({ apiKey, supabase, question, history, uf, period_months });

    if (history.length === 0 && result.validation?.ok !== false && !result.answer.startsWith("Não consegui finalizar")) {
      supabase.from("ai_query_cache").upsert({
        cache_key: cacheKey, question,
        filters: { period_months, uf: uf || null },
        response: result, model_used: result.toolsUsed?.length ? "agent" : "direct",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "cache_key" }).then(() => {}, (err: any) => console.error("cache upsert failed", err));
    }

    logUsage(supabase, {
      function_name: "market-analysis",
      model: (result.toolsUsed?.length ? "agent-mix" : "direct"),
      user_id: userId, cached: false, duration_ms: Date.now() - t0, status: "success",
      metadata: { period_months, uf, tools: result.toolsUsed?.map(t => t.name) || [] }
    });
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("market-analysis error:", e);
    const msg = e?.message || "Erro interno.";
    const status = msg.includes("Rate") ? 429 : msg.includes("Crédito") ? 402 : 500;
    if (supabase) logUsage(supabase, { function_name: "market-analysis", user_id: userId, status: "error", duration_ms: Date.now() - t0, error_message: msg });
    return new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
