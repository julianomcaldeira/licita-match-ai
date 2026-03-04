import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PNCP_CONSULTA_URL = "https://pncp.gov.br/api/consulta/v1";
const PNCP_DATA_URL = "https://pncp.gov.br/api/pncp/v1";
const PAGE_SIZE = 50; // PNCP API max is now 50 (was 500 before API change)
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
  dataFinal: string,
  fetchWinners = false,
  cnpj?: string
): Promise<{ total: number; winners: number; errors: string[] }> {
  let pagina = 1;
  let hasMore = true;
  let total = 0;
  let winnersFound = 0;
  const errors: string[] = [];

  while (hasMore) {
    try {
      let url = `${PNCP_CONSULTA_URL}/contratacoes/publicacao?dataInicial=${dataInicial}&dataFinal=${dataFinal}&codigoModalidadeContratacao=${modalidade}&pagina=${pagina}&tamanhoPagina=${PAGE_SIZE}`;
      if (cnpj) url += `&cnpj=${cnpj}`;
      
      const response = await fetchWithRetry(url);
      if (!response.ok) {
        const errBody = await response.text();
        console.error(`API error mod ${modalidade} page ${pagina}: ${response.status} - ${errBody.slice(0, 200)}`);
        errors.push(`Mod ${modalidade} pag ${pagina}: HTTP ${response.status} - ${errBody.slice(0, 100)}`);
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
              const PARALLEL = 10;
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

      hasMore = contratacoes.length >= PAGE_SIZE;
      pagina++;
    } catch (e) {
      errors.push(`Mod ${modalidade} pag ${pagina}: ${e instanceof Error ? e.message : "unknown"}`);
      hasMore = false;
    }
  }

  return { total, winners: winnersFound, errors };
}

/**
 * MODE "orgao": Search and ingest all licitações from a specific organ by CNPJ or name
 * This queries the PNCP API with the cnpj filter to fetch ALL records for that organ
 */
async function handleOrgao(supabase: any, body: any) {
  const { cnpj, nome, dataInicial = "20230101" } = body;
  
  if (!cnpj && !nome) {
    return new Response(
      JSON.stringify({ success: false, error: "Informe o CNPJ ou nome do órgão" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // If only name provided, try to find CNPJ via PNCP search
  let orgaoCnpj = cnpj;
  let orgaoNome = nome || "";
  
  if (!orgaoCnpj && nome) {
    // Search PNCP for the organ
    try {
      const searchUrl = `${PNCP_CONSULTA_URL}/contratacoes/publicacao?dataInicial=20260101&dataFinal=${fmtDate(new Date())}&pagina=1&tamanhoPagina=5&codigoModalidadeContratacao=5`;
      // We can't search by name directly, we need to try different approaches
      // Let's try the orgaos endpoint
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
      JSON.stringify({ success: false, error: `Órgão "${nome}" não encontrado na API do PNCP. Tente informar o CNPJ diretamente.` }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const today = fmtDate(new Date());
  let totalIngested = 0;
  let totalWinners = 0;
  const allErrors: string[] = [];

  console.log(`Fetching all licitações for CNPJ ${orgaoCnpj} (${orgaoNome}) from ${dataInicial} to ${today}`);

  // Process all modalidades for this CNPJ
  for (const mod of MODALIDADES) {
    console.log(`  Mod ${mod}: fetching...`);
    const result = await fetchAllPages(supabase, mod, dataInicial, today, true, orgaoCnpj);
    totalIngested += result.total;
    totalWinners += result.winners;
    allErrors.push(...result.errors);
    console.log(`  Mod ${mod}: ${result.total} records, ${result.winners} winners`);
  }

  // Log
  await supabase.from("ingestao_logs").insert({
    fonte: "PNCP",
    endpoint: `orgao/${orgaoCnpj}`,
    status: allErrors.length > 0 ? "parcial" : "sucesso",
    registros_processados: totalIngested,
    data_inicio: fmtDateISO(dataInicial),
    data_fim: fmtDateISO(today),
    erro: allErrors.length > 0 ? allErrors.join("; ").slice(0, 1000) : null,
  });

  return new Response(
    JSON.stringify({ 
      success: true, 
      orgao: orgaoNome, 
      cnpj: orgaoCnpj,
      totalIngested, 
      totalWinners, 
      errors: allErrors.length 
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

/**
 * MODE "cron": Incremental daily ingestion
 */
async function handleCron(supabase: any) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = fmtDate(yesterday);

  let totalIngested = 0;
  let totalWinners = 0;
  const errors: string[] = [];

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
      const lastDate = existing.last_date_processed;
      const y = parseInt(lastDate.substring(0, 4));
      const m = parseInt(lastDate.substring(4, 6)) - 1;
      const d = parseInt(lastDate.substring(6, 8));
      const nextDay = new Date(y, m, d + 1);
      startDate = fmtDate(nextDay);
    } else {
      startDate = yesterdayStr;
    }

    if (startDate > yesterdayStr) {
      console.log(`Mod ${mod}: already up to date (last: ${existing?.last_date_processed})`);
      continue;
    }

    console.log(`Mod ${mod}: fetching ${startDate} → ${yesterdayStr}`);
    const result = await fetchAllPages(supabase, mod, startDate, yesterdayStr, true);
    totalIngested += result.total;
    totalWinners += result.winners;
    errors.push(...result.errors);

    await supabase.from("sync_status").upsert({
      api_source: "pncp",
      modalidade: mod,
      last_date_processed: yesterdayStr,
      total_synced: (existing?.total_synced || 0) + result.total,
      updated_at: new Date().toISOString(),
    }, { onConflict: "api_source,modalidade" });
  }

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

    for (const item of itens) {
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
 * MODE "ingest" (manual): Bulk ingestion with improved throughput
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
    const lastDate = syncRow.last_date_processed;
    const y = parseInt(lastDate.substring(0, 4));
    const m = parseInt(lastDate.substring(4, 6)) - 1;
    const d = parseInt(lastDate.substring(6, 8));
    const nextDay = new Date(y, m, d + 1);
    startDate = fmtDate(nextDay);
  } else {
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

  const startY = parseInt(startDate.substring(0, 4));
  const startM = parseInt(startDate.substring(4, 6));
  const endY = parseInt(dataFinal.substring(0, 4));
  const endM = parseInt(dataFinal.substring(4, 6));

  let totalProcessed = 0;
  const allErrors: string[] = [];
  let lastProcessedDate = startDate;
  let hasMore = false;

  // Process only 1 month per call to avoid edge function timeout (60s)
  let monthsProcessed = 0;
  const MAX_MONTHS_PER_CALL = 1;

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
      const result = await fetchAllPages(supabase, modalidade, monthStart, monthEnd, false);
      totalProcessed += result.total;
      allErrors.push(...result.errors);
      lastProcessedDate = monthEnd;
      monthsProcessed++;
    }
    if (hasMore) break;
  }

  await supabase.from("sync_status").upsert({
    api_source: "pncp",
    modalidade,
    last_date_processed: lastProcessedDate,
    total_synced: (syncRow?.total_synced || 0) + totalProcessed,
    updated_at: new Date().toISOString(),
  }, { onConflict: "api_source,modalidade" });

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

  const PARALLEL = 10; // Increased from 5 for faster processing
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
 * MODE "bulk-backfill": Now processes ONE modalidade at a time, ONE month window.
 * Uses sync_status with api_source='pncp-backfill' to track progress per modalidade.
 * Designed to be called repeatedly (e.g., every 2 min via pg_cron).
 * Target: fill gap from 20231201 to 20260303.
 */
async function handleBulkBackfill(supabase: any, body: any) {
  const backfillStart = body.dataInicial || "20231201";
  const backfillEnd = body.dataFinal || fmtDate(new Date());

  // Find the next modalidade that still needs backfilling
  const { data: backfillRows } = await supabase
    .from("sync_status")
    .select("*")
    .eq("api_source", "pncp-backfill");

  const backfillMap: Record<number, string> = {};
  for (const row of backfillRows || []) {
    backfillMap[row.modalidade] = row.last_date_processed;
  }

  let targetMod: number | null = null;
  let startDate = backfillStart;

  for (const mod of MODALIDADES) {
    const lastProcessed = backfillMap[mod];
    if (!lastProcessed) {
      // Never started this modalidade
      targetMod = mod;
      startDate = backfillStart;
      break;
    }
    if (lastProcessed < backfillEnd) {
      // Still has months to process
      const y = parseInt(lastProcessed.substring(0, 4));
      const m = parseInt(lastProcessed.substring(4, 6)) - 1;
      const d = parseInt(lastProcessed.substring(6, 8));
      const nextDay = new Date(y, m, d + 1);
      targetMod = mod;
      startDate = fmtDate(nextDay);
      break;
    }
    // This modalidade is complete, try next
  }

  if (targetMod === null) {
    console.log("All modalidades backfilled up to", backfillEnd);
    return new Response(
      JSON.stringify({ success: true, totalIngested: 0, complete: true, message: "Backfill complete" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (startDate > backfillEnd) {
    console.log(`Mod ${targetMod}: already complete`);
    // Mark as done and let next call pick up next modalidade
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

  // Process ONE month for this modalidade
  const sy = parseInt(startDate.substring(0, 4));
  const sm = parseInt(startDate.substring(4, 6));
  const lastDay = new Date(sy, sm, 0).getDate();
  let monthEnd = `${sy}${String(sm).padStart(2, "0")}${String(lastDay).padStart(2, "0")}`;
  if (monthEnd > backfillEnd) monthEnd = backfillEnd;

  console.log(`Backfill: Mod ${targetMod} ${startDate} → ${monthEnd}`);
  const result = await fetchAllPages(supabase, targetMod, startDate, monthEnd, false);
  console.log(`Backfill: Mod ${targetMod} done: ${result.total} records, ${result.errors.length} errors`);

  // Update backfill progress
  const existing = backfillMap[targetMod];
  const prevTotal = (backfillRows || []).find((r: any) => r.modalidade === targetMod)?.total_synced || 0;

  await supabase.from("sync_status").upsert({
    api_source: "pncp-backfill", modalidade: targetMod,
    last_date_processed: monthEnd,
    total_synced: prevTotal + result.total,
    updated_at: new Date().toISOString(),
  }, { onConflict: "api_source,modalidade" });

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
    if (mode === "orgao") return await handleOrgao(supabase, body);
    if (mode === "bulk-backfill") return await handleBulkBackfill(supabase, body);
    return await handleIngest(supabase, body);
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
