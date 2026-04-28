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
const FETCH_TIMEOUT_MS = 15_000;
const MAX_FETCH_RETRIES = 5;
const MAX_RANGE_SPLIT_DEPTH = 8;
const MAX_BACKFILL_WINDOW_DAYS = 3;
const MAX_MANUAL_INGEST_WINDOW_DAYS = 7;
// Modalidades de altíssimo volume (Dispensa=8) que estouram o limite de paginação do PNCP (~10k registros)
// quando consultadas em janelas longas — usamos janela diária para evitar HTTP 422.
const HIGH_VOLUME_MODALIDADES = new Set<number>([8]);
const HIGH_VOLUME_BACKFILL_WINDOW_DAYS = 1;

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

function addDays(yyyymmdd: string, days: number): string {
  const y = parseInt(yyyymmdd.substring(0, 4));
  const m = parseInt(yyyymmdd.substring(4, 6)) - 1;
  const d = parseInt(yyyymmdd.substring(6, 8));
  const dt = new Date(y, m, d + days);
  return fmtDate(dt);
}

function diffDays(dataInicial: string, dataFinal: string): number {
  const start = new Date(`${fmtDateISO(dataInicial)}T00:00:00Z`);
  const end = new Date(`${fmtDateISO(dataFinal)}T00:00:00Z`);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
}

function splitDateRange(dataInicial: string, dataFinal: string) {
  const totalDays = diffDays(dataInicial, dataFinal);
  if (totalDays <= 0) {
    return null;
  }

  const midpointDays = Math.floor(totalDays / 2);
  const leftEnd = addDays(dataInicial, midpointDays);
  const rightStart = addDays(leftEnd, 1);

  if (rightStart > dataFinal) {
    return null;
  }

  return [
    { dataInicial, dataFinal: leftEnd },
    { dataInicial: rightStart, dataFinal },
  ] as const;
}

function capDateRange(dataInicial: string, dataFinal: string, maxDaysInclusive: number) {
  if (maxDaysInclusive <= 1) {
    return dataInicial < dataFinal ? dataInicial : dataFinal;
  }

  const cappedEnd = addDays(dataInicial, maxDaysInclusive - 1);
  return cappedEnd < dataFinal ? cappedEnd : dataFinal;
}

function isRetryableFetchError(message: string): boolean {
  return /HTTP\s(?:429|5\d\d)|timed out|timeout|fetch failed|connection|network|abort|aborted|signal has been aborted/i.test(message);
}

// HTTP 422 do PNCP normalmente significa "janela retorna mais registros do que o limite paginável (~10k)".
// Tratamos como sinal para subdividir a janela de datas até caber.
function isWindowTooLargeError(message: string): boolean {
  return /HTTP\s422/i.test(message);
}

function isSplittableError(message: string): boolean {
  return isRetryableFetchError(message) || isWindowTooLargeError(message);
}

function mergeFetchResults(results: Array<{ total: number; winners: number; errors: string[]; pagesOk: number }>) {
  return results.reduce(
    (acc, current) => ({
      total: acc.total + current.total,
      winners: acc.winners + current.winners,
      errors: [...acc.errors, ...current.errors],
      pagesOk: acc.pagesOk + current.pagesOk,
    }),
    { total: 0, winners: 0, errors: [] as string[], pagesOk: 0 }
  );
}

async function fetchWithRetry(url: string, retries = MAX_FETCH_RETRIES, delayMs = 2000): Promise<Response> {
  let lastError: Error | null = null;

  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const resp = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
      const shouldRetryStatus = resp.status === 429 || resp.status >= 500;

      if (shouldRetryStatus && i < retries - 1) {
        const wait = delayMs * Math.pow(2, i);
        const errBody = await resp.clone().text().catch(() => "");
        console.warn(`PNCP retry ${i + 1}/${retries} for ${url}: HTTP ${resp.status} ${errBody.slice(0, 160)}`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      return resp;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error("Unknown fetch error");
      if (i === retries - 1) throw lastError;
      const wait = delayMs * Math.pow(2, i);
      console.warn(`PNCP request failed, retrying in ${wait}ms: ${lastError.message}`);
      await new Promise((r) => setTimeout(r, wait));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("Max retries reached");
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
 * Fetch one date range + modalidade combo, all pages.
 * Returns actual page count to detect incomplete fetches.
 */
async function fetchAllPages(
  supabase: any,
  modalidade: number,
  dataInicial: string,
  dataFinal: string,
  fetchWinners = false,
  cnpj?: string
): Promise<{ total: number; winners: number; errors: string[]; pagesOk: number }> {
  let pagina = 1;
  let hasMore = true;
  let total = 0;
  let winnersFound = 0;
  let pagesOk = 0;
  const errors: string[] = [];

  while (hasMore) {
    try {
      let url = `${PNCP_CONSULTA_URL}/contratacoes/publicacao?dataInicial=${dataInicial}&dataFinal=${dataFinal}&codigoModalidadeContratacao=${modalidade}&pagina=${pagina}&tamanhoPagina=${PAGE_SIZE}`;
      if (cnpj) url += `&cnpj=${cnpj}`;

      const response = await fetchWithRetry(url);
      if (!response.ok) {
        const errBody = await response.text();
        console.error(`API error mod ${modalidade} page ${pagina}: ${response.status} - ${errBody.slice(0, 200)}`);
        errors.push(`Mod ${modalidade} pag ${pagina}: HTTP ${response.status}`);
        hasMore = false;
        continue;
      }
      const text = await response.text();
      const data = safeParseJSON(text);
      if (!data) { hasMore = false; continue; }
      const contratacoes = data.data || (Array.isArray(data) ? data : []);
      if (contratacoes.length === 0) { hasMore = false; continue; }

      const rows = contratacoes.map(mapContratacao);
      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200);
        if (fetchWinners) {
          const { data: upserted, error } = await supabase
            .from("licitacoes")
            .upsert(batch, { onConflict: "id_origem,fonte" })
            .select("id, numero_controle_pncp, raw_json");
          if (error) {
            errors.push(`Mod ${modalidade} pag ${pagina}: ${error.message}`);
          } else {
            total += batch.length;
            if (upserted) {
              const PARALLEL = 15;
              for (let j = 0; j < upserted.length; j += PARALLEL) {
                const winBatch = upserted.slice(j, j + PARALLEL);
                const results = await Promise.allSettled(
                  winBatch.map((lic: any) => processWinner(supabase, lic))
                );
                for (const r of results) {
                  if (r.status === "fulfilled") winnersFound += r.value;
                }
              }
            }
          }
        } else {
          const { error } = await supabase.from("licitacoes").upsert(batch, { onConflict: "id_origem,fonte" });
          if (error) errors.push(`Mod ${modalidade} pag ${pagina}: ${error.message}`);
          else total += batch.length;
        }
      }

      pagesOk++;
      hasMore = contratacoes.length >= PAGE_SIZE;
      pagina++;
    } catch (e) {
      errors.push(`Mod ${modalidade} pag ${pagina}: ${e instanceof Error ? e.message : "unknown"}`);
      hasMore = false;
    }
  }

  return { total, winners: winnersFound, errors, pagesOk };
}

async function fetchRangeResilient(
  supabase: any,
  modalidade: number,
  dataInicial: string,
  dataFinal: string,
  fetchWinners = false,
  cnpj?: string,
  depth = 0
): Promise<{ total: number; winners: number; errors: string[]; pagesOk: number }> {
  const result = await fetchAllPages(supabase, modalidade, dataInicial, dataFinal, fetchWinners, cnpj);

  if (
    result.errors.length === 0 ||
    depth >= MAX_RANGE_SPLIT_DEPTH ||
    !result.errors.every(isSplittableError)
  ) {
    return result;
  }

  const ranges = splitDateRange(dataInicial, dataFinal);
  if (!ranges) {
    // Janela já está em 1 dia e ainda há 422 → estouro real do limite do PNCP.
    // Não há como recuperar via split: marcamos como sucesso parcial para destravar o progresso.
    if (result.errors.every(isWindowTooLargeError)) {
      console.warn(
        `PNCP: janela mínima ${dataInicial} (mod ${modalidade}) ainda retorna HTTP 422 — aceitando parcial para destravar backfill.`
      );
      return { ...result, errors: [] };
    }
    return result;
  }

  const [leftRange, rightRange] = ranges;
  console.warn(
    `PNCP range split for modalidade ${modalidade}: ${dataInicial}-${dataFinal} -> ${leftRange.dataInicial}-${leftRange.dataFinal} and ${rightRange.dataInicial}-${rightRange.dataFinal}`
  );

  const leftResult = await fetchRangeResilient(
    supabase,
    modalidade,
    leftRange.dataInicial,
    leftRange.dataFinal,
    fetchWinners,
    cnpj,
    depth + 1
  );
  const rightResult = await fetchRangeResilient(
    supabase,
    modalidade,
    rightRange.dataInicial,
    rightRange.dataFinal,
    fetchWinners,
    cnpj,
    depth + 1
  );

  return mergeFetchResults([leftResult, rightResult]);
}

/**
 * Process a single licitação for winners (items + results)
 */
async function processWinner(supabase: any, lic: any): Promise<number> {
  const raw = lic.raw_json;
  const cnpj = raw?.orgaoEntidade?.cnpj || raw?.unidadeOrgao?.cnpj;
  const ano = raw?.anoCompra;
  const seq = raw?.sequencialCompra;
  let winnersFound = 0;

  if (!cnpj || !ano || !seq) {
    await supabase.from("licitacao_itens").upsert({
      licitacao_id: lic.id, descricao: raw?.objetoCompra || "Item geral", numero_item: 0,
    }, { onConflict: "licitacao_id,numero_item" });
    return 0;
  }

  try {
    const itensResp = await fetch(`${PNCP_DATA_URL}/orgaos/${cnpj}/compras/${ano}/${seq}/itens`, { headers: { Accept: "application/json" } });
    if (!itensResp.ok) {
      await itensResp.text();
      await supabase.from("licitacao_itens").upsert({
        licitacao_id: lic.id, descricao: raw?.objetoCompra || "Item geral", numero_item: 0,
      }, { onConflict: "licitacao_id,numero_item" });
      return 0;
    }

    const itens = await itensResp.json();
    if (!Array.isArray(itens) || itens.length === 0) {
      await supabase.from("licitacao_itens").upsert({
        licitacao_id: lic.id, descricao: raw?.objetoCompra || "Item geral", numero_item: 0,
      }, { onConflict: "licitacao_id,numero_item" });
      return 0;
    }

    // Batch upsert all items at once
    const itemRows = itens
      .filter((item: any) => item.numeroItem || item.sequencialItem)
      .map((item: any) => ({
        licitacao_id: lic.id,
        descricao: item.descricao || item.materialOuServico || "Item",
        numero_item: item.numeroItem || item.sequencialItem,
        quantidade: item.quantidade || null,
        unidade: item.unidadeMedida || null,
        valor_unitario_estimado: item.valorUnitarioEstimado || null,
      }));

    if (itemRows.length === 0) {
      await supabase.from("licitacao_itens").upsert({
        licitacao_id: lic.id, descricao: raw?.objetoCompra || "Item geral", numero_item: 0,
      }, { onConflict: "licitacao_id,numero_item" });
      return 0;
    }

    const { data: dbItems } = await supabase
      .from("licitacao_itens")
      .upsert(itemRows, { onConflict: "licitacao_id,numero_item" })
      .select("id, numero_item");

    if (!dbItems || dbItems.length === 0) return 0;

    // Build map of numero_item -> db id
    const itemIdMap: Record<number, string> = {};
    for (const di of dbItems) {
      itemIdMap[di.numero_item] = di.id;
    }

    // Fetch results for items that have them, in parallel batches
    const itemsWithResults = itens.filter((item: any) => item.temResultado && (item.numeroItem || item.sequencialItem));
    const PARALLEL_RESULTS = 15;

    for (let i = 0; i < itemsWithResults.length; i += PARALLEL_RESULTS) {
      const batch = itemsWithResults.slice(i, i + PARALLEL_RESULTS);
      const results = await Promise.allSettled(
        batch.map(async (item: any) => {
          const seqItem = item.numeroItem || item.sequencialItem;
          const dbItemId = itemIdMap[seqItem];
          if (!dbItemId) return 0;

          try {
            const rResp = await fetch(
              `${PNCP_DATA_URL}/orgaos/${cnpj}/compras/${ano}/${seq}/itens/${seqItem}/resultados`,
              { headers: { Accept: "application/json" } }
            );
            if (!rResp.ok) { await rResp.text(); return 0; }
            const resultados = await rResp.json();
            const rList = Array.isArray(resultados) ? resultados : [resultados];
            let count = 0;

            // Batch upsert winners
            const winnerRows = rList
              .filter((r: any) => r?.nomeRazaoSocialFornecedor || r?.niFornecedor)
              .map((r: any) => ({
                item_id: dbItemId,
                razao_social: r.nomeRazaoSocialFornecedor || "Não informado",
                cnpj: r.niFornecedor || null,
                valor_final: r.valorTotalHomologado || r.valorUnitarioHomologado || null,
                percentual_desconto: r.percentualDesconto || null,
              }));

            if (winnerRows.length > 0) {
              const { error: winErr } = await supabase
                .from("licitacao_vencedores")
                .upsert(winnerRows, { onConflict: "item_id,cnpj" });
              if (!winErr) count = winnerRows.length;
            }
            return count;
          } catch { return 0; }
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled") winnersFound += r.value;
      }
    }
  } catch (e) {
    console.warn(`Error processing ${lic.numero_controle_pncp}:`, e);
  }

  return winnersFound;
}

/**
 * MODE "cron": Fetch last 7 days for ALL modalidades (covers gaps from missed days)
 */
async function handleCron(supabase: any) {
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);
  const startStr = fmtDate(weekAgo);
  const endStr = fmtDate(today);

  let totalIngested = 0;
  let totalWinners = 0;
  const errors: string[] = [];

  for (const mod of MODALIDADES) {
    console.log(`Cron: Mod ${mod} ${startStr} → ${endStr}`);
    const result = await fetchRangeResilient(supabase, mod, startStr, endStr, true);
    totalIngested += result.total;
    totalWinners += result.winners;
    errors.push(...result.errors);

    // Only update sync_status if we had no errors
    if (result.errors.length === 0) {
      await supabase.from("sync_status").upsert({
        api_source: "pncp",
        modalidade: mod,
        last_date_processed: endStr,
        total_synced: result.total,
        updated_at: new Date().toISOString(),
      }, { onConflict: "api_source,modalidade" });
    }
  }

  await supabase.from("ingestao_logs").insert({
    fonte: "PNCP",
    endpoint: "cron-diario-7d",
    status: errors.length > 0 ? "parcial" : "sucesso",
    registros_processados: totalIngested,
    data_inicio: fmtDateISO(startStr),
    data_fim: fmtDateISO(endStr),
    erro: errors.length > 0 ? errors.join("; ").slice(0, 1000) : null,
  });

  console.log(`Cron completed: ${totalIngested} ingested, ${totalWinners} winners, ${errors.length} errors`);

  return new Response(
    JSON.stringify({ success: true, totalIngested, totalWinners, errors: errors.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

/**
 * MODE "winners": Process licitações without items/winners
 * Increased batch size and parallelism for faster processing
 */
async function handleWinners(supabase: any, body: any) {
  const batchSize = body.limit || 500;

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

  const PARALLEL = 20;
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

/**
 * MODE "bulk-backfill": Process ONE month for the next incomplete modalidade.
 * Only marks as complete if there were NO errors.
 */
async function handleBulkBackfill(supabase: any, body: any) {
  const backfillStart = body.dataInicial || "20230101";
  const backfillEnd = body.dataFinal || fmtDate(new Date());

  const { data: backfillRows } = await supabase
    .from("sync_status")
    .select("*")
    .eq("api_source", "pncp-backfill");

  const backfillMap: Record<number, { last: string; synced: number }> = {};
  for (const row of backfillRows || []) {
    backfillMap[row.modalidade] = { last: row.last_date_processed, synced: row.total_synced || 0 };
  }

  let targetMod: number | null = null;
  let startDate = backfillStart;

  for (const mod of MODALIDADES) {
    const entry = backfillMap[mod];
    if (!entry) {
      targetMod = mod;
      startDate = backfillStart;
      break;
    }
    if (entry.last < backfillEnd) {
      targetMod = mod;
      startDate = addDays(entry.last, 1);
      break;
    }
  }

  if (targetMod === null) {
    console.log("All modalidades backfilled up to", backfillEnd);
    return new Response(
      JSON.stringify({ success: true, totalIngested: 0, complete: true, message: "Backfill complete" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (startDate > backfillEnd) {
    await supabase.from("sync_status").upsert({
      api_source: "pncp-backfill", modalidade: targetMod,
      last_date_processed: backfillEnd,
      updated_at: new Date().toISOString(),
    }, { onConflict: "api_source,modalidade" });
    return new Response(
      JSON.stringify({ success: true, totalIngested: 0, modalidade: targetMod, complete: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const windowDays = HIGH_VOLUME_MODALIDADES.has(targetMod)
    ? HIGH_VOLUME_BACKFILL_WINDOW_DAYS
    : MAX_BACKFILL_WINDOW_DAYS;
  const monthEnd = capDateRange(startDate, backfillEnd, windowDays);

  console.log(`Backfill: Mod ${targetMod} ${startDate} → ${monthEnd} (janela ${windowDays}d)`);
  const result = await fetchRangeResilient(supabase, targetMod, startDate, monthEnd, false);
  console.log(`Backfill: Mod ${targetMod} done: ${result.total} records, ${result.errors.length} errors`);

  const prevTotal = backfillMap[targetMod]?.synced || 0;

  // CRITICAL: Only advance progress if no errors occurred
  if (result.errors.length === 0) {
    await supabase.from("sync_status").upsert({
      api_source: "pncp-backfill", modalidade: targetMod,
      last_date_processed: monthEnd,
      total_synced: prevTotal + result.total,
      updated_at: new Date().toISOString(),
    }, { onConflict: "api_source,modalidade" });
  } else {
    console.warn(`Backfill: Mod ${targetMod} had ${result.errors.length} errors, NOT advancing progress`);
  }

  await supabase.from("ingestao_logs").insert({
    fonte: "PNCP", endpoint: `backfill/mod-${targetMod}`,
    status: result.errors.length > 0 ? "parcial" : "sucesso",
    registros_processados: result.total,
    data_inicio: fmtDateISO(startDate), data_fim: fmtDateISO(monthEnd),
    erro: result.errors.length > 0 ? result.errors.join("; ").slice(0, 1000) : null,
  });

  return new Response(
    JSON.stringify({
      success: true, totalIngested: result.total,
      modalidade: targetMod, period: `${startDate}-${monthEnd}`,
      errors: result.errors.length, complete: false,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

/**
 * MODE "gap-fill": Detect and fill date gaps in specific modalidades.
 * Compares expected daily data presence against actual records.
 */
async function handleGapFill(supabase: any) {
  // Check which modalidades have gaps in the last 30 days
  const today = new Date();
  const thirtyAgo = new Date(today);
  thirtyAgo.setDate(today.getDate() - 30);
  const startStr = fmtDate(thirtyAgo);
  const endStr = fmtDate(today);

  // Get daily counts per modalidade for last 30 days
  const { data: dailyCounts } = await supabase
    .from("licitacoes")
    .select("modalidade, data_publicacao")
    .gte("data_publicacao", fmtDateISO(startStr))
    .lte("data_publicacao", fmtDateISO(endStr));

  // Group by modalidade -> set of dates with data
  const datesByMod: Record<string, Set<string>> = {};
  for (const row of dailyCounts || []) {
    if (!row.modalidade) continue;
    if (!datesByMod[row.modalidade]) datesByMod[row.modalidade] = new Set();
    datesByMod[row.modalidade].add(row.data_publicacao);
  }

  // For each high-volume modalidade, find the last date with data
  const MODALIDADE_NAMES: Record<number, string> = {
    4: "Concorrência - Eletrônica", 5: "Pregão - Eletrônico", 6: "Dispensa",
    7: "Inexigibilidade", 8: "Pregão - Presencial", 9: "Concorrência - Presencial",
    12: "Credenciamento",
  };

  let totalFilled = 0;
  const fillErrors: string[] = [];

  for (const [modId, modName] of Object.entries(MODALIDADE_NAMES)) {
    const dates = datesByMod[modName];
    if (!dates) continue;

    // Find the max date this modalidade has data for
    const sortedDates = Array.from(dates).sort();
    const lastDate = sortedDates[sortedDates.length - 1];
    const lastDateFmt = lastDate.replace(/-/g, "");

    // If last date is more than 3 days behind today, re-fetch
    const daysBehind = Math.floor((today.getTime() - new Date(lastDate).getTime()) / 86400000);
    if (daysBehind > 2) {
      const gapStart = addDays(lastDateFmt, 1);
      console.log(`Gap-fill: ${modName} (mod ${modId}) last data: ${lastDate}, ${daysBehind} days behind. Fetching ${gapStart} → ${endStr}`);
      const result = await fetchRangeResilient(supabase, parseInt(modId), gapStart, endStr, true);
      totalFilled += result.total;
      fillErrors.push(...result.errors);
      console.log(`Gap-fill: ${modName} filled ${result.total} records`);
    }
  }

  if (totalFilled > 0 || fillErrors.length > 0) {
    await supabase.from("ingestao_logs").insert({
      fonte: "PNCP", endpoint: "gap-fill",
      status: fillErrors.length > 0 ? "parcial" : "sucesso",
      registros_processados: totalFilled,
      data_inicio: fmtDateISO(startStr), data_fim: fmtDateISO(endStr),
      erro: fillErrors.length > 0 ? fillErrors.join("; ").slice(0, 1000) : null,
    });
  }

  return new Response(
    JSON.stringify({ success: true, totalFilled, errors: fillErrors.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

/**
 * MODE "orgao": Ingest all licitações from a specific organ by CNPJ
 */
async function handleOrgao(supabase: any, body: any) {
  const { cnpj, nome, dataInicial = "20230101" } = body;

  if (!cnpj && !nome) {
    return new Response(
      JSON.stringify({ success: false, error: "Informe o CNPJ ou nome do órgão" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let orgaoCnpj = cnpj;
  let orgaoNome = nome || "";

  if (!orgaoCnpj && nome) {
    try {
      const orgaoResp = await fetchWithRetry(`${PNCP_DATA_URL}/orgaos?razaoSocial=${encodeURIComponent(nome)}&pagina=1&tamanhoPagina=10`);
      if (orgaoResp.ok) {
        const orgaos = await orgaoResp.json();
        const orgaoList = Array.isArray(orgaos) ? orgaos : orgaos?.data || [];
        if (orgaoList.length > 0) {
          orgaoCnpj = orgaoList[0].cnpj;
          orgaoNome = orgaoList[0].razaoSocial || nome;
          console.log(`Found organ: ${orgaoNome} (CNPJ: ${orgaoCnpj})`);
        }
      }
    } catch (e) {
      console.warn("Error searching for organ:", e);
    }
  }

  if (!orgaoCnpj) {
    return new Response(
      JSON.stringify({ success: false, error: `Órgão "${nome}" não encontrado na API do PNCP.` }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const today = fmtDate(new Date());
  let totalIngested = 0;
  let totalWinners = 0;
  const allErrors: string[] = [];

  console.log(`Fetching all licitações for CNPJ ${orgaoCnpj} from ${dataInicial} to ${today}`);

  for (const mod of MODALIDADES) {
    const result = await fetchRangeResilient(supabase, mod, dataInicial, today, true, orgaoCnpj);
    totalIngested += result.total;
    totalWinners += result.winners;
    allErrors.push(...result.errors);
  }

  await supabase.from("ingestao_logs").insert({
    fonte: "PNCP", endpoint: `orgao/${orgaoCnpj}`,
    status: allErrors.length > 0 ? "parcial" : "sucesso",
    registros_processados: totalIngested,
    data_inicio: fmtDateISO(dataInicial), data_fim: fmtDateISO(today),
    erro: allErrors.length > 0 ? allErrors.join("; ").slice(0, 1000) : null,
  });

  return new Response(
    JSON.stringify({ success: true, orgao: orgaoNome, cnpj: orgaoCnpj, totalIngested, totalWinners, errors: allErrors.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

/**
 * MODE "ingest" (manual): Bulk ingestion
 */
async function handleIngest(supabase: any, body: any) {
  const modalidade: number = body.modalidade || 6;
  const forceStartDate: string | undefined = body.dataInicial;

  const { data: syncRow } = await supabase
    .from("sync_status")
    .select("*")
    .eq("api_source", "pncp")
    .eq("modalidade", modalidade)
    .maybeSingle();

  let startDate: string;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const endDate = fmtDate(yesterday);

  if (forceStartDate) {
    startDate = forceStartDate;
  } else if (syncRow) {
    startDate = addDays(syncRow.last_date_processed, 1);
  } else {
    startDate = "20230101";
  }

  const dataFinal = body.dataFinal || endDate;

  if (startDate > dataFinal) {
    return new Response(
      JSON.stringify({ success: true, totalProcessed: 0, hasMore: false, modalidade, message: "Already up to date" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const monthEnd = capDateRange(startDate, dataFinal, MAX_MANUAL_INGEST_WINDOW_DAYS);

  console.log(`Ingest: Mod ${modalidade} ${startDate} → ${monthEnd}`);
  const result = await fetchRangeResilient(supabase, modalidade, startDate, monthEnd, false);

  const hasMore = monthEnd < dataFinal;

  // Only update progress if no errors
  if (result.errors.length === 0) {
    await supabase.from("sync_status").upsert({
      api_source: "pncp", modalidade,
      last_date_processed: monthEnd,
      total_synced: (syncRow?.total_synced || 0) + result.total,
      updated_at: new Date().toISOString(),
    }, { onConflict: "api_source,modalidade" });
  }

  await supabase.from("ingestao_logs").insert({
    fonte: "PNCP",
    endpoint: `/contratacoes/publicacao?mod=${modalidade}`,
    status: result.errors.length > 0 ? "parcial" : "sucesso",
    registros_processados: result.total,
    data_inicio: fmtDateISO(startDate), data_fim: fmtDateISO(monthEnd),
    erro: result.errors.length > 0 ? result.errors.join("; ").slice(0, 1000) : null,
  });

  return new Response(
    JSON.stringify({ success: true, totalProcessed: result.total, hasMore, modalidade, lastProcessedDate: monthEnd }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// --- Auth helpers ---

async function authenticateAdmin(req: Request): Promise<{ userId: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "").trim();

  // Internal pipeline bypass: requests from pipeline-orchestrator carry the
  // SERVICE_ROLE_KEY. service_role is never exposed to the client, so trust it.
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (serviceKey && token === serviceKey) {
    return { userId: "internal-pipeline" };
  }

  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "",
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data, error } = await supabaseAuth.auth.getClaims(token);
  if (error || !data?.claims) return null;

  const userId = data.claims.sub as string;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: roles } = await supabase
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin_central").limit(1);

  if (!roles?.length) return null;
  return { userId };
}

function isSchedulerMode(mode: string): boolean {
  return ["cron", "winners", "bulk-backfill", "backfill", "gap-fill"].includes(mode);
}

function hasSchedulerToken(req: Request): boolean {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token || token.split(".").length < 2) return false;

  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const claims = JSON.parse(atob(padded));
    return claims?.role === "anon";
  } catch {
    return false;
  }
}

// --- Main handler ---

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const body = await req.json().catch(() => ({}));
  const requestedMode = typeof body.mode === "string" ? body.mode : "ingest";
  const mode = requestedMode === "backfill" ? "bulk-backfill" : requestedMode;

  const schedulerAuthorized = isSchedulerMode(requestedMode) && hasSchedulerToken(req);
  if (!schedulerAuthorized) {
    const auth = await authenticateAdmin(req);
    if (!auth) {
      return new Response(JSON.stringify({ error: "Não autorizado. Acesso restrito a administradores." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    if (mode === "winners") return await handleWinners(supabase, body);
    if (mode === "cron") return await handleCron(supabase);
    if (mode === "orgao") return await handleOrgao(supabase, body);
    if (mode === "bulk-backfill") return await handleBulkBackfill(supabase, body);
    if (mode === "gap-fill") return await handleGapFill(supabase);
    return await handleIngest(supabase, body);
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Erro interno na ingestão. Tente novamente." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
