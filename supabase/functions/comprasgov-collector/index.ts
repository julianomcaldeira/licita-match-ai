import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-sync-secret",
};

const PNCP_CONTRATOS = "https://pncp.gov.br/api/consulta/v1/contratos";
const PAGE_SIZE = 500;
const MAX_RETRIES = 2;
const MAX_EXECUTION_MS = 50_000;

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(15000) });
      if (resp.ok) return resp;
      if ((resp.status === 429 || resp.status >= 500) && attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return resp;
    } catch (err) {
      if (attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
  throw new Error(`Failed after ${retries} retries`);
}

function categorize(objeto: string): string {
  const lower = (objeto || "").toLowerCase();
  if (/hospitalar|saúde|saude|médic|medic|farmac|ambulânc|ambulanc|vacinaç|vacinac|medicament/.test(lower)) return "Saúde";
  if (/software|sistem|tecnologia|informática|informatica|computador|ti |cloud|servidor|digital/.test(lower)) return "TI";
  if (/construç|construc|obra|reform|paviment|infraestrutura|rodovia|ponte|edificaç|edificac/.test(lower)) return "Infraestrutura";
  if (/educaç|educac|escola|universidade|ensino|livro|didátic|didatic/.test(lower)) return "Educação";
  if (/aliment|refeição|refeicao|merenda|nutriç|nutric/.test(lower)) return "Alimentação";
  if (/seguranç|seguranca|defesa|armament|militar|polícia|policia/.test(lower)) return "Defesa e Segurança";
  if (/transport|veícul|veiculo|combustível|combustivel|frota|logístic|logistic|pneu/.test(lower)) return "Transportes";
  if (/ambient|sustent|florestal|recicl|saneament/.test(lower)) return "Meio Ambiente";
  if (/energia|elétric|eletric|solar|eólica|eolica/.test(lower)) return "Energia";
  if (/consultoria|assessoria|auditoria|gestão|gestao/.test(lower)) return "Consultoria";
  if (/limpeza|conservação|conservacao|manutenção|manutencao|vigilância|vigilancia|terceiriz/.test(lower)) return "Serviços Gerais";
  return "Outros";
}

function getMonthDates(year: number, month: number): { start: string; end: string } {
  const startDate = `${year}${String(month).padStart(2, "0")}01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}${String(month).padStart(2, "0")}${lastDay}`;
  return { start: startDate, end: endDate };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SYNC_SECRET = Deno.env.get("SYNC_SECRET");
  if (!SYNC_SECRET || req.headers.get("x-sync-secret") !== SYNC_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const startTime = Date.now();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  let body: { ano?: number; mes?: number; reset?: boolean } = {};
  try { body = await req.json(); } catch { /* no body */ }

  const ano = body.ano ?? currentYear;
  const jobName = `pncp-contratos-${ano}`;

  // Load cursor
  let cursor: { mes?: number; pagina?: number; concluido?: boolean; ultimaExecucao?: string } = {};
  if (!body.reset) {
    const { data } = await sb.from("sync_state").select("cursor").eq("job_name", jobName).maybeSingle();
    if (data?.cursor) cursor = data.cursor as any;
  }

  // Determine starting point + which months to visit
  let months: number[];
  let startPage = 1;

  if (body.mes) {
    months = [body.mes];
    startPage = cursor.mes === body.mes ? (cursor.pagina || 1) : 1;
  } else if (cursor.concluido && ano === currentYear) {
    // Maintenance mode: recollect current + previous month
    months = currentMonth > 1 ? [currentMonth - 1, currentMonth] : [currentMonth];
    startPage = 1;
  } else if (cursor.concluido) {
    // Past year already fully collected — nothing to do unless reset
    return new Response(JSON.stringify({ status: "already_complete", cursor }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } else {
    const startMonth = cursor.mes || 1;
    const endMonth = ano === currentYear ? currentMonth : 12;
    months = [];
    for (let m = startMonth; m <= endMonth; m++) months.push(m);
    startPage = cursor.pagina || 1;
  }

  let totalInserted = 0;
  let totalErrors = 0;
  let timedOut = false;
  let lastMes = months[0];
  let lastPagina = startPage;

  outer: for (let i = 0; i < months.length; i++) {
    const mes = months[i];
    let page = i === 0 ? startPage : 1;
    const { start, end } = getMonthDates(ano, mes);

    while (true) {
      if (Date.now() - startTime > MAX_EXECUTION_MS) {
        timedOut = true;
        lastMes = mes;
        lastPagina = page;
        break outer;
      }

      try {
        const url = `${PNCP_CONTRATOS}?dataInicial=${start}&dataFinal=${end}&pagina=${page}&tamanhoPagina=${PAGE_SIZE}`;
        const resp = await fetchWithRetry(url);
        if (!resp.ok) {
          totalErrors++;
          break; // move to next month
        }
        const result = await resp.json();
        const items = result?.data || [];
        if (!Array.isArray(items) || items.length === 0) break;

        const rows = items
          .filter((item: any) => item.niFornecedor && item.tipoPessoa === "PJ")
          .map((item: any) => ({
            cnpj_fornecedor: item.niFornecedor,
            nome_fornecedor: item.nomeRazaoSocialFornecedor || "Não informado",
            valor: item.valorGlobal || item.valorInicial || 0,
            objeto: item.objetoContrato || "",
            uf: item.unidadeOrgao?.ufSigla || null,
            categoria: categorize(item.objetoContrato || ""),
            orgao: item.orgaoEntidade?.razaoSocial || null,
            data_assinatura: item.dataAssinatura || null,
            data_vigencia_inicio: item.dataVigenciaInicio || null,
            data_vigencia_fim: item.dataVigenciaFim || null,
            ano,
            trimestre: Math.ceil(mes / 3),
            numero_controle_pncp: item.numeroControlePNCP || null,
          }))
          .filter((r: any) => r.numero_controle_pncp);

        if (rows.length > 0) {
          const { error } = await sb
            .from("contratos_comprasgov")
            .upsert(rows, { onConflict: "numero_controle_pncp" });
          if (error) totalErrors++;
          else totalInserted += rows.length;
        }

        lastMes = mes;
        lastPagina = page;

        if (items.length < PAGE_SIZE) break; // last page for this month
        page++;
        await new Promise(r => setTimeout(r, 150));
      } catch (err) {
        console.error(`Error mes=${mes} page=${page}:`, err);
        totalErrors++;
        break;
      }
    }
  }

  // Compute new cursor
  let newCursor: Record<string, unknown>;
  let status: string;

  if (timedOut) {
    newCursor = { mes: lastMes, pagina: lastPagina + 1 };
    status = "in_progress";
  } else {
    // Finished all requested months
    const endMonth = ano === currentYear ? currentMonth : 12;
    if (!body.mes && lastMes >= endMonth) {
      newCursor = { concluido: true, ultimaExecucao: new Date().toISOString() };
      status = "success";
    } else if (body.mes) {
      // ad-hoc single month; preserve existing cursor
      newCursor = cursor as any;
      status = "success";
    } else {
      newCursor = { mes: lastMes + 1, pagina: 1 };
      status = "in_progress";
    }
  }

  await sb.from("sync_state").upsert(
    { job_name: jobName, cursor: newCursor, updated_at: new Date().toISOString() },
    { onConflict: "job_name" }
  );

  const elapsed = Date.now() - startTime;

  await sb.from("api_logs").insert({
    api_name: "pncp-contratos-fornecedores",
    endpoint: PNCP_CONTRATOS,
    status: totalErrors > 0 && totalInserted === 0 ? "error" : status === "in_progress" ? "partial" : "success",
    records_imported: totalInserted,
    http_status: 200,
    response_time_ms: elapsed,
    error_message: `job=${jobName} status=${status} cursor=${JSON.stringify(newCursor)} errors=${totalErrors}`,
  });

  return new Response(
    JSON.stringify({ success: true, jobName, status, totalInserted, totalErrors, cursor: newCursor, elapsedMs: elapsed }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
