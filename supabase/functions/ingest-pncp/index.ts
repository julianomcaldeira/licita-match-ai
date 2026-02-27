import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PNCP_CONSULTA_URL = "https://pncp.gov.br/api/consulta/v1";
const PNCP_DATA_URL = "https://pncp.gov.br/api/pncp/v1";
const PAGE_SIZE = 50;
const MODALIDADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

interface PNCPContratacao {
  numeroControlePNCP?: string;
  orgaoEntidade?: { razaoSocial?: string; cnpj?: string };
  modalidadeId?: number;
  modalidadeNome?: string;
  objetoCompra?: string;
  dataPublicacaoPncp?: string;
  dataResultadoCompra?: string;
  valorTotalEstimado?: number;
  valorTotalHomologado?: number;
  situacaoCompraId?: number;
  situacaoCompraNome?: string;
  unidadeOrgao?: { ufSigla?: string; municipioNome?: string; cnpj?: string };
  anoCompra?: number;
  sequencialCompra?: number;
  [key: string]: unknown;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDateISO(yyyymmdd: string): string {
  return yyyymmdd.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
}

async function fetchWithRetry(url: string, retries = 3, delayMs = 2000): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, { headers: { Accept: "application/json" } });
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

function safeParseJSON(text: string): any {
  if (!text || !text.trim()) return [];
  try {
    return JSON.parse(text);
  } catch {
    const lastBrace = text.lastIndexOf("}");
    if (lastBrace > 0) {
      try {
        return JSON.parse(text.substring(0, lastBrace + 1) + "]");
      } catch { /* fall through */ }
    }
    return null;
  }
}

function mapContratacao(c: PNCPContratacao) {
  return {
    id_origem: c.numeroControlePNCP || `pncp-${Date.now()}-${Math.random()}`,
    fonte: "PNCP",
    orgao: c.orgaoEntidade?.razaoSocial || "Não informado",
    modalidade: c.modalidadeNome || null,
    objeto: c.objetoCompra || "Sem descrição",
    data_publicacao: c.dataPublicacaoPncp ? c.dataPublicacaoPncp.split("T")[0] : null,
    data_resultado: c.dataResultadoCompra ? c.dataResultadoCompra.split("T")[0] : null,
    valor_estimado: c.valorTotalEstimado || null,
    valor_homologado: c.valorTotalHomologado || null,
    situacao: c.situacaoCompraNome || null,
    numero_controle_pncp: c.numeroControlePNCP || null,
    uf: c.unidadeOrgao?.ufSigla || null,
    municipio: c.unidadeOrgao?.municipioNome || null,
    raw_json: c as unknown as Record<string, unknown>,
  };
}

/**
 * Fetch one date range + modalidade combo, all pages
 */
async function fetchAllPages(
  supabase: any,
  modalidade: number,
  dataInicial: string,
  dataFinal: string
): Promise<{ total: number; errors: string[] }> {
  let pagina = 1;
  let hasMore = true;
  let total = 0;
  const errors: string[] = [];

  while (hasMore) {
    try {
      const url = `${PNCP_CONSULTA_URL}/contratacoes/publicacao?dataInicial=${dataInicial}&dataFinal=${dataFinal}&codigoModalidadeContratacao=${modalidade}&pagina=${pagina}&tamanhoPagina=${PAGE_SIZE}`;
      const response = await fetchWithRetry(url);
      if (!response.ok) {
        await response.text();
        hasMore = false;
        continue;
      }
      const text = await response.text();
      const data = safeParseJSON(text);
      if (!data) { hasMore = false; continue; }
      const contratacoes = data.data || (Array.isArray(data) ? data : []);
      if (contratacoes.length === 0) { hasMore = false; continue; }

      const rows = contratacoes.map(mapContratacao);
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        const { error } = await supabase.from("licitacoes").upsert(batch, { onConflict: "id_origem,fonte" });
        if (error) errors.push(`Mod ${modalidade} pag ${pagina}: ${error.message}`);
        else total += batch.length;
      }

      hasMore = contratacoes.length >= PAGE_SIZE;
      pagina++;
    } catch (e) {
      errors.push(`Mod ${modalidade} pag ${pagina}: ${e instanceof Error ? e.message : "unknown"}`);
      hasMore = false;
    }
  }

  return { total, errors };
}

/**
 * MODE "cron": Incremental daily ingestion
 * - Checks sync_status for each modalidade to find last processed date
 * - Only fetches from last_date + 1 day to yesterday
 * - Updates sync_status after each modalidade
 */
async function handleCron(supabase: any) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = fmtDate(yesterday);

  let totalIngested = 0;
  let totalWinners = 0;
  const errors: string[] = [];

  // Get current sync status for all modalidades
  const { data: syncRows } = await supabase
    .from("sync_status")
    .select("*")
    .eq("api_source", "pncp");

  const syncMap: Record<number, { last_date_processed: string; total_synced: number }> = {};
  for (const row of syncRows || []) {
    syncMap[row.modalidade] = { last_date_processed: row.last_date_processed, total_synced: row.total_synced };
  }

  for (const mod of MODALIDADES) {
    const existing = syncMap[mod];
    let startDate: string;

    if (existing) {
      // Calculate next day after last processed
      const lastDate = existing.last_date_processed;
      const y = parseInt(lastDate.substring(0, 4));
      const m = parseInt(lastDate.substring(4, 6)) - 1;
      const d = parseInt(lastDate.substring(6, 8));
      const nextDay = new Date(y, m, d + 1);
      startDate = fmtDate(nextDay);
    } else {
      // First run: start from yesterday only (not the full history)
      startDate = yesterdayStr;
    }

    // Skip if already up to date
    if (startDate > yesterdayStr) {
      console.log(`Mod ${mod}: already up to date (last: ${existing?.last_date_processed})`);
      continue;
    }

    console.log(`Mod ${mod}: fetching ${startDate} → ${yesterdayStr}`);
    const result = await fetchAllPages(supabase, mod, startDate, yesterdayStr);
    totalIngested += result.total;
    errors.push(...result.errors);

    // Update sync_status
    await supabase.from("sync_status").upsert({
      api_source: "pncp",
      modalidade: mod,
      last_date_processed: yesterdayStr,
      total_synced: (existing?.total_synced || 0) + result.total,
      updated_at: new Date().toISOString(),
    }, { onConflict: "api_source,modalidade" });
  }

  // Phase 2: Fetch winners for up to 20 licitações
  try {
    const { data: licitacoes } = await supabase.rpc("licitacoes_sem_itens", { lim: 20 });
    if (licitacoes && licitacoes.length > 0) {
      for (const lic of licitacoes) {
        const w = await processWinner(supabase, lic);
        totalWinners += w;
      }
    }
  } catch (e) {
    errors.push(`Winners: ${e instanceof Error ? e.message : "unknown"}`);
  }

  // Log the result
  await supabase.from("ingestao_logs").insert({
    fonte: "PNCP",
    endpoint: "cron-diario",
    status: errors.length > 0 ? "parcial" : "sucesso",
    registros_processados: totalIngested,
    data_inicio: fmtDateISO(yesterdayStr),
    data_fim: fmtDateISO(yesterdayStr),
    erro: errors.length > 0 ? errors.join("; ").slice(0, 1000) : null,
  });

  console.log(`Cron completed: ${totalIngested} ingested, ${totalWinners} winners, ${errors.length} errors`);

  return new Response(
    JSON.stringify({ success: true, totalIngested, totalWinners, errors: errors.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

/**
 * Process a single licitação for winners
 */
async function processWinner(supabase: any, lic: any): Promise<number> {
  const raw = lic.raw_json;
  const cnpj = raw?.orgaoEntidade?.cnpj || raw?.unidadeOrgao?.cnpj;
  const ano = raw?.anoCompra;
  const seq = raw?.sequencialCompra;
  let winnersFound = 0;

  if (!cnpj || !ano || !seq) {
    await supabase.from("licitacao_itens").insert({
      licitacao_id: lic.id, descricao: raw?.objetoCompra || "Item geral", numero_item: 0,
    });
    return 0;
  }

  try {
    const itensResp = await fetch(`${PNCP_DATA_URL}/orgaos/${cnpj}/compras/${ano}/${seq}/itens`, { headers: { Accept: "application/json" } });
    if (!itensResp.ok) {
      await itensResp.text();
      await supabase.from("licitacao_itens").insert({
        licitacao_id: lic.id, descricao: raw?.objetoCompra || "Item geral", numero_item: 0,
      });
      return 0;
    }

    const itens = await itensResp.json();
    if (!Array.isArray(itens) || itens.length === 0) {
      await supabase.from("licitacao_itens").insert({
        licitacao_id: lic.id, descricao: raw?.objetoCompra || "Item geral", numero_item: 0,
      });
      return 0;
    }

    for (const item of itens.slice(0, 5)) {
      const seqItem = item.numeroItem || item.sequencialItem;
      if (!seqItem) continue;

      const { data: dbItem } = await supabase
        .from("licitacao_itens")
        .upsert({
          licitacao_id: lic.id, descricao: item.descricao || item.materialOuServico || "Item",
          numero_item: seqItem, quantidade: item.quantidade || null,
          unidade: item.unidadeMedida || null, valor_unitario_estimado: item.valorUnitarioEstimado || null,
        }, { onConflict: "licitacao_id,numero_item" })
        .select("id").single();

      if (!dbItem) continue;

      if (item.temResultado) {
        try {
          const rResp = await fetch(
            `${PNCP_DATA_URL}/orgaos/${cnpj}/compras/${ano}/${seq}/itens/${seqItem}/resultados`,
            { headers: { Accept: "application/json" } }
          );
          if (rResp.ok) {
            const resultados = await rResp.json();
            const rList = Array.isArray(resultados) ? resultados : [resultados];
            for (const r of rList) {
              if (r?.nomeRazaoSocialFornecedor || r?.niFornecedor) {
                const { error: winErr } = await supabase.from("licitacao_vencedores").upsert({
                  item_id: dbItem.id, razao_social: r.nomeRazaoSocialFornecedor || "Não informado",
                  cnpj: r.niFornecedor || null, valor_final: r.valorTotalHomologado || r.valorUnitarioHomologado || null,
                  percentual_desconto: r.percentualDesconto || null,
                }, { onConflict: "item_id" });
                if (!winErr) winnersFound++;
                break;
              }
            }
          } else { await rResp.text(); }
        } catch { /* skip */ }
      }
    }
  } catch (e) {
    console.warn(`Error fetching winners for ${lic.numero_controle_pncp}:`, e);
  }

  return winnersFound;
}

/**
 * MODE "ingest" (manual): Incremental ingestion for a specific modalidade
 * Uses sync_status to track progress. Only fetches new data.
 */
async function handleIngest(supabase: any, body: any) {
  const modalidade: number = body.modalidade || 6;
  const forceStartDate: string | undefined = body.dataInicial;

  // Get last sync state for this modalidade
  const { data: syncRow } = await supabase
    .from("sync_status")
    .select("*")
    .eq("api_source", "pncp")
    .eq("modalidade", modalidade)
    .maybeSingle();

  let startDate: string;
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const endDate = fmtDate(yesterday);

  if (forceStartDate) {
    // Manual override
    startDate = forceStartDate;
  } else if (syncRow) {
    // Resume from last processed date + 1
    const lastDate = syncRow.last_date_processed;
    const y = parseInt(lastDate.substring(0, 4));
    const m = parseInt(lastDate.substring(4, 6)) - 1;
    const d = parseInt(lastDate.substring(6, 8));
    const nextDay = new Date(y, m, d + 1);
    startDate = fmtDate(nextDay);
  } else {
    // First run: start from Jan 2023
    startDate = "20230101";
  }

  const dataFinal = body.dataFinal || endDate;

  if (startDate > dataFinal) {
    console.log(`Mod ${modalidade}: already up to date (last: ${syncRow?.last_date_processed})`);
    return new Response(
      JSON.stringify({ success: true, totalProcessed: 0, hasMore: false, modalidade, message: "Already up to date" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Process in monthly chunks to avoid timeouts
  const startY = parseInt(startDate.substring(0, 4));
  const startM = parseInt(startDate.substring(4, 6));
  const endY = parseInt(dataFinal.substring(0, 4));
  const endM = parseInt(dataFinal.substring(4, 6));

  let totalProcessed = 0;
  const allErrors: string[] = [];
  let lastProcessedDate = startDate;
  let hasMore = false;

  // Process one month at a time, stop after ~2 months to avoid timeout
  let monthsProcessed = 0;
  const MAX_MONTHS_PER_CALL = 2;

  for (let y = startY; y <= endY; y++) {
    const mStart = (y === startY) ? startM : 1;
    const mEnd = (y === endY) ? endM : 12;
    for (let m = mStart; m <= mEnd; m++) {
      if (monthsProcessed >= MAX_MONTHS_PER_CALL) {
        hasMore = true;
        break;
      }

      const monthStart = `${y}${String(m).padStart(2, "0")}${m === startM && y === startY ? startDate.substring(6, 8) : "01"}`;
      const lastDay = new Date(y, m, 0).getDate();
      let monthEnd = `${y}${String(m).padStart(2, "0")}${String(lastDay).padStart(2, "0")}`;
      if (monthEnd > dataFinal) monthEnd = dataFinal;

      console.log(`Mod ${modalidade}: fetching ${monthStart} → ${monthEnd}`);
      const result = await fetchAllPages(supabase, modalidade, monthStart, monthEnd);
      totalProcessed += result.total;
      allErrors.push(...result.errors);
      lastProcessedDate = monthEnd;
      monthsProcessed++;
    }
    if (hasMore) break;
  }

  // Update sync_status
  await supabase.from("sync_status").upsert({
    api_source: "pncp",
    modalidade,
    last_date_processed: lastProcessedDate,
    total_synced: (syncRow?.total_synced || 0) + totalProcessed,
    updated_at: new Date().toISOString(),
  }, { onConflict: "api_source,modalidade" });

  // Log to ingestao_logs
  await supabase.from("ingestao_logs").insert({
    fonte: "PNCP",
    endpoint: `/contratacoes/publicacao?mod=${modalidade}`,
    status: allErrors.length > 0 ? "parcial" : "sucesso",
    registros_processados: totalProcessed,
    data_inicio: fmtDateISO(startDate),
    data_fim: fmtDateISO(lastProcessedDate),
    erro: allErrors.length > 0 ? allErrors.join("; ").slice(0, 1000) : null,
  });

  return new Response(
    JSON.stringify({ success: true, totalProcessed, hasMore, modalidade, lastProcessedDate }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleWinners(supabase: any, body: any) {
  const batchSize = body.limit || 50;

  const { data: licitacoes, error: queryErr } = await supabase
    .rpc("licitacoes_sem_itens", { lim: batchSize });

  if (queryErr || !licitacoes || licitacoes.length === 0) {
    console.log("No more licitações without items:", queryErr?.message || "all processed");
    return new Response(
      JSON.stringify({ success: true, winnersFound: 0, processed: 0, hasMore: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log(`Processing ${licitacoes.length} licitações for winners`);
  let winnersFound = 0;
  let processed = 0;

  // Process in parallel batches of 5 for speed
  const PARALLEL = 5;
  for (let i = 0; i < licitacoes.length; i += PARALLEL) {
    const batch = licitacoes.slice(i, i + PARALLEL);
    const results = await Promise.allSettled(
      batch.map((lic: any) => processWinner(supabase, lic))
    );
    for (const r of results) {
      if (r.status === "fulfilled") winnersFound += r.value;
      processed++;
    }
  }

  // Log
  await supabase.from("ingestao_logs").insert({
    fonte: "PNCP",
    endpoint: "busca-vencedores",
    status: "sucesso",
    registros_processados: winnersFound,
    data_inicio: new Date().toISOString().split("T")[0],
    data_fim: new Date().toISOString().split("T")[0],
  });

  return new Response(
    JSON.stringify({
      success: true, winnersFound, processed,
      hasMore: licitacoes.length >= batchSize,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const body = await req.json().catch(() => ({}));
  const mode = body.mode || "ingest";

  try {
    if (mode === "winners") return await handleWinners(supabase, body);
    if (mode === "cron") return await handleCron(supabase);
    return await handleIngest(supabase, body);
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
