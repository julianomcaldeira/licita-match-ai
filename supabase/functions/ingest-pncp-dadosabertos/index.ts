// PNCP Dados Abertos - bulk ingestion of contratos, itens and resultados (winners).
//
// Strategy:
//   1) Walk /api/consulta/v1/contratos by date window. Each page returns up to
//      500 contracts with full payload (orgao, fornecedor, valores). We persist
//      the raw JSON in `pncp_raw` (tipo='contrato') AND normalize into `contratos`.
//   2) For every distinct compra referenced by those contratos
//      (numeroControlePncpCompra = "<cnpj>-1-<seq>/<ano>"), we hit
//      /api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/itens to get items, and
//      for each item /itens/{n}/resultados to get winners. We persist raw +
//      normalize into licitacao_itens / licitacao_vencedores when the parent
//      licitacao already exists in our base.
//
// Safe to call repeatedly: cursor (sync_status row 'pncp-dadosabertos-contratos')
// advances by date, ON CONFLICT ignores dedup.
//
// Modes:
//   POST {} or {"mode":"daily"}    - resume from cursor, ingest 1 day, advance
//   POST {"mode":"backfill","dataInicial":"YYYYMMDD","dataFinal":"YYYYMMDD"}
//   POST {"mode":"compra","cnpj":"...","ano":2024,"sequencial":67}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PNCP_CONSULTA = "https://pncp.gov.br/api/consulta/v1";
const PNCP_DATA = "https://pncp.gov.br/api/pncp/v1";
const PAGE_SIZE = 500;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 3;
const COMPRA_CONCURRENCY = 8;
const ITEM_CONCURRENCY = 5;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function fmtDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(yyyymmdd: string, days: number): string {
  const y = +yyyymmdd.slice(0, 4),
    m = +yyyymmdd.slice(4, 6) - 1,
    d = +yyyymmdd.slice(6, 8);
  return fmtDate(new Date(Date.UTC(y, m, d + days)));
}
function todayYmd(): string {
  return fmtDate(new Date());
}

async function fetchJson(url: string, opts: { deadline?: number } = {}): Promise<any> {
  let lastErr: any = null;
  const deadline = opts.deadline ?? Infinity;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // respeita o deadline da execucao: nao inicia tentativa sem folga minima
    const remaining = deadline - Date.now();
    if (remaining < 6_000) break;
    const timeoutMs = Math.max(5_000, Math.min(FETCH_TIMEOUT_MS, remaining - 2_000));
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        signal: ctrl.signal,
        headers: { accept: "application/json" },
      });
      clearTimeout(t);
      if (r.status === 204 || r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      const backoff = 1500 * (attempt + 1);
      if (Date.now() + backoff > deadline - 6_000) break;
      await new Promise((res) => setTimeout(res, backoff));
    }
  }
  throw lastErr ?? new Error("fetch failed");
}


interface ContratoApi {
  numeroControlePNCP: string;
  numeroControlePncpCompra?: string;
  orgaoEntidade?: { cnpj?: string; razaoSocial?: string };
  unidadeOrgao?: { ufSigla?: string; municipioNome?: string; nomeUnidade?: string };
  niFornecedor?: string;
  nomeRazaoSocialFornecedor?: string;
  numeroContratoEmpenho?: string;
  objetoContrato?: string;
  valorInicial?: number;
  valorGlobal?: number;
  dataAssinatura?: string;
  dataVigenciaInicio?: string;
  dataVigenciaFim?: string;
  dataPublicacaoPncp?: string;
  anoContrato?: number;
  categoriaProcesso?: { nome?: string };
  tipoContrato?: { nome?: string };
}

function parseCompraKey(numeroControlePncpCompra?: string) {
  // Format: "<cnpj14>-1-<sequencial6>/<ano4>"
  if (!numeroControlePncpCompra) return null;
  const m = numeroControlePncpCompra.match(/^(\d{14})-1-(\d+)\/(\d{4})$/);
  if (!m) return null;
  return { cnpj: m[1], sequencial: parseInt(m[2], 10), ano: parseInt(m[3], 10) };
}

async function pMap<T, R>(items: T[], fn: (x: T) => Promise<R>, concurrency: number): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) break;
      try {
        out[idx] = await fn(items[idx]);
      } catch (e) {
        out[idx] = undefined as any;
      }
    }
  });
  await Promise.all(workers);
  return out;
}

async function ingestContratosWindow(
  supabase: any,
  dataInicial: string,
  dataFinal: string,
  opts: {
    startPage?: number;
    deadline?: number;
    skipRaw?: boolean;
    onPage?: (info: { nextPage: number; contratos: number }) => Promise<void>;
  } = {},
): Promise<{ pages: number; contratos: number; comprasUnicas: number; errors: string[]; nextPage: number | null }> {
  const errors: string[] = [];
  let totalContratos = 0;
  let pages = 0;
  const compraKeys = new Set<string>();
  const rawBatch: any[] = [];
  const normBatch: any[] = [];
  const deadline = opts.deadline ?? Infinity;
  let nextPage: number | null = null;

  let pagina = Math.max(1, opts.startPage ?? 1);
  while (true) {
    // precisa de folga para buscar + gravar a pagina
    if (Date.now() > deadline - 8_000) {
      nextPage = pagina;
      break;
    }
    const url = `${PNCP_CONSULTA}/contratos?dataInicial=${dataInicial}&dataFinal=${dataFinal}&pagina=${pagina}&tamanhoPagina=${PAGE_SIZE}`;
    let data: any;
    try {
      data = await fetchJson(url, { deadline });
    } catch (e) {

      errors.push(`page ${pagina}: ${e instanceof Error ? e.message : String(e)}`);
      nextPage = pagina;
      break;
    }
    if (!data || !Array.isArray(data.data) || data.data.length === 0) break;
    pages++;

    for (const c of data.data as ContratoApi[]) {
      totalContratos++;
      if (c.numeroControlePncpCompra) compraKeys.add(c.numeroControlePncpCompra);

      if (!opts.skipRaw) {
        rawBatch.push({
          tipo: "contrato",
          chave_origem: c.numeroControlePNCP ?? `${c.orgaoEntidade?.cnpj}-${c.anoContrato}-${c.numeroContratoEmpenho}`,
          payload: c,
        });
      }

      normBatch.push({
        numero_contrato: c.numeroContratoEmpenho ?? c.numeroControlePNCP,
        cnpj_orgao: c.orgaoEntidade?.cnpj ?? "",
        orgao_nome: c.orgaoEntidade?.razaoSocial ?? null,
        fornecedor_cnpj: c.niFornecedor ?? null,
        fornecedor_nome: c.nomeRazaoSocialFornecedor ?? null,
        objeto: c.objetoContrato ?? null,
        valor_inicial: c.valorInicial ?? null,
        valor_final: c.valorGlobal ?? null,
        data_assinatura: c.dataAssinatura ?? null,
        data_vigencia_inicio: c.dataVigenciaInicio ?? null,
        data_vigencia_fim: c.dataVigenciaFim ?? null,
        data_publicacao: c.dataPublicacaoPncp ? c.dataPublicacaoPncp.slice(0, 10) : null,
        modalidade_compra: null,
        categoria: c.categoriaProcesso?.nome ?? null,
        situacao: c.tipoContrato?.nome ?? null,
        numero_licitacao: c.numeroControlePncpCompra ?? null,
        fonte: "PNCP_DADOS_ABERTOS",
        raw_json: c,
      });
    }

    // Flush in chunks
    if (normBatch.length >= 200) {
      if (rawBatch.length) await flushRaw(supabase, rawBatch.splice(0));
      await flushContratos(supabase, normBatch.splice(0));
    }

    if (data.data.length < PAGE_SIZE) break;
    if (data.totalPaginas && pagina >= data.totalPaginas) break;
    pagina++;

    // persiste o progresso a cada pagina concluida (nada se perde se a execucao morrer)
    if (opts.onPage) {
      if (rawBatch.length) await flushRaw(supabase, rawBatch.splice(0));
      if (normBatch.length) await flushContratos(supabase, normBatch.splice(0));
      try {
        await opts.onPage({ nextPage: pagina, contratos: totalContratos });
      } catch (_) { /* progresso e best-effort */ }
    }
  }


  if (rawBatch.length) await flushRaw(supabase, rawBatch);
  if (normBatch.length) await flushContratos(supabase, normBatch);

  return { pages, contratos: totalContratos, comprasUnicas: compraKeys.size, errors, nextPage };
}


async function flushRaw(supabase: any, rows: any[]) {
  if (!rows.length) return;
  const { error } = await supabase
    .from("pncp_raw")
    .upsert(rows, { onConflict: "tipo,chave_origem", ignoreDuplicates: true });
  if (error) console.error("[pncp_raw upsert]", error.message);
}

async function flushContratos(supabase: any, rows: any[]) {
  if (!rows.length) return;
  // Dedup in-batch by (cnpj_orgao, numero_contrato)
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    const k = `${r.cnpj_orgao}|${r.numero_contrato}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const { error } = await supabase.from("contratos").upsert(unique, {
    onConflict: "cnpj_orgao,numero_contrato",
    ignoreDuplicates: true,
  });
  if (error) console.error("[contratos upsert]", error.message);
}

async function ensureLicitacao(
  supabase: any,
  compraKey: string,
  cnpj: string,
  ano: number,
  sequencial: number,
): Promise<string | null> {
  // Try existing
  const { data: existing } = await supabase
    .from("licitacoes")
    .select("id")
    .eq("numero_controle_pncp", compraKey)
    .maybeSingle();
  if (existing?.id) return existing.id;

  // Fetch full compra details from PNCP and insert
  const detailUrl = `${PNCP_CONSULTA}/orgaos/${cnpj}/compras/${ano}/${sequencial}`;
  const c = await fetchJson(detailUrl).catch(() => null);
  if (!c || !c.numeroControlePNCP) return null;

  const row = {
    id_origem: c.numeroControlePNCP,
    fonte: "PNCP_DADOS_ABERTOS",
    orgao: c.orgaoEntidade?.razaoSocial ?? "—",
    modalidade: c.modalidadeNome ?? null,
    objeto: c.objetoCompra ?? "—",
    data_publicacao: c.dataPublicacaoPncp ? c.dataPublicacaoPncp.slice(0, 10) : null,
    data_resultado: c.dataResultadoCompra ? c.dataResultadoCompra.slice(0, 10) : null,
    valor_estimado: c.valorTotalEstimado ?? null,
    valor_homologado: c.valorTotalHomologado ?? null,
    situacao: c.situacaoCompraNome ?? null,
    numero_controle_pncp: c.numeroControlePNCP,
    uf: c.unidadeOrgao?.ufSigla ?? null,
    municipio: c.unidadeOrgao?.municipioNome ?? null,
    raw_json: c,
  };

  const { data: inserted, error } = await supabase
    .from("licitacoes")
    .upsert(row, { onConflict: "numero_controle_pncp", ignoreDuplicates: false })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[licitacoes upsert]", error.message);
    return null;
  }
  return inserted?.id ?? null;
}

async function ingestCompraDetails(
  supabase: any,
  compraKey: string,
): Promise<{ items: number; winners: number }> {
  const parsed = parseCompraKey(compraKey);
  if (!parsed) return { items: 0, winners: 0 };
  const { cnpj, ano, sequencial } = parsed;

  // 1) Ensure parent licitacao exists (creates from PNCP detail if missing)
  const licId = await ensureLicitacao(supabase, compraKey, cnpj, ano, sequencial);

  // 2) Items
  const itemsUrl = `${PNCP_DATA}/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens`;
  const items = await fetchJson(itemsUrl);
  if (!Array.isArray(items) || items.length === 0) return { items: 0, winners: 0 };

  // raw items
  const rawRows = items.map((it: any) => ({
    tipo: "item",
    chave_origem: `${compraKey}#${it.numeroItem}`,
    payload: it,
  }));
  await flushRaw(supabase, rawRows);

  let insertedItems = 0;
  let insertedWinners = 0;

  if (licId) {
    const lic = { id: licId };
    // Insert/normalize items
    const itemRows = items.map((it: any) => ({
      licitacao_id: lic.id,
      numero_item: it.numeroItem,
      descricao: it.descricao ?? "",
      quantidade: it.quantidade ?? null,
      unidade: it.unidadeMedida ?? null,
      valor_unitario_estimado: it.valorUnitarioEstimado ?? null,
    }));
    // Need to fetch existing item ids
    const { data: existing } = await supabase
      .from("licitacao_itens")
      .select("id, numero_item")
      .eq("licitacao_id", lic.id);
    const existingMap = new Map<number, string>();
    for (const e of existing ?? []) existingMap.set(e.numero_item, e.id);

    const toInsert = itemRows.filter((r) => !existingMap.has(r.numero_item));
    if (toInsert.length) {
      const { data: ins, error } = await supabase
        .from("licitacao_itens")
        .insert(toInsert)
        .select("id, numero_item");
      if (!error) {
        insertedItems = ins?.length ?? 0;
        for (const e of ins ?? []) existingMap.set(e.numero_item, e.id);
      }
    }

    // 3) Winners per item (only items with temResultado)
    const itemsComResultado = items.filter((it: any) => it.temResultado);
    await pMap(
      itemsComResultado,
      async (it: any) => {
        const itemId = existingMap.get(it.numeroItem);
        if (!itemId) return;
        const url = `${PNCP_DATA}/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens/${it.numeroItem}/resultados`;
        const results = await fetchJson(url).catch(() => null);
        if (!Array.isArray(results) || results.length === 0) return;

        const rawWinners = results.map((r: any, idx: number) => ({
          tipo: "resultado",
          chave_origem: `${compraKey}#${it.numeroItem}#${r.sequencialResultado ?? idx}`,
          payload: r,
        }));
        await flushRaw(supabase, rawWinners);

        const winnerRows = results
          .filter((r: any) => r.niFornecedor || r.nomeRazaoSocialFornecedor)
          .map((r: any) => ({
            item_id: itemId,
            cnpj: r.niFornecedor ?? null,
            razao_social: r.nomeRazaoSocialFornecedor ?? null,
            valor_final: r.valorTotalHomologado ?? r.valorUnitarioHomologado ?? null,
            percentual_desconto: r.percentualDesconto ?? null,
          }));
        if (winnerRows.length) {
          const { error } = await supabase
            .from("licitacao_vencedores")
            .upsert(winnerRows, { onConflict: "item_id,cnpj", ignoreDuplicates: true });
          if (!error) insertedWinners += winnerRows.length;
        }
      },
      ITEM_CONCURRENCY,
    );
  }

  return { items: insertedItems, winners: insertedWinners };
}

async function logRun(
  supabase: any,
  endpoint: string,
  status: string,
  registros: number,
  inicio: string,
  fim: string,
  erro?: string,
) {
  await supabase.from("ingestao_logs").insert({
    fonte: "PNCP_DADOS_ABERTOS",
    endpoint,
    status,
    registros_processados: registros,
    data_inicio: inicio,
    data_fim: fim,
    erro: erro ?? null,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const mode = body.mode || "daily";

  const startedAt = new Date().toISOString();

  try {
    if (mode === "compra") {
      const cnpj = String(body.cnpj || "");
      const ano = +body.ano;
      const seq = +body.sequencial;
      if (!cnpj || !ano || !seq) {
        return new Response(JSON.stringify({ error: "cnpj/ano/sequencial required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const key = `${cnpj}-1-${String(seq).padStart(6, "0")}/${ano}`;
      const r = await ingestCompraDetails(supabase, key);
      return new Response(JSON.stringify({ ok: true, mode, key, ...r }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mode === "cleanup-orfaos") {
      // Process orphan compras: those with contratos in pncp_raw but missing licitacoes
      const batchSize = Math.min(+body.batchSize || 100, 300);
      const { data: orphans, error: orphErr } = await supabase.rpc("get_orfaos_dadosabertos", {
        p_limit: batchSize,
      });
      if (orphErr) throw orphErr;
      const keys: string[] = (orphans ?? []).map((r: any) => r.compra_key).filter(Boolean);

      let totalItems = 0;
      let totalWinners = 0;
      let processed = 0;
      const errors: string[] = [];
      await pMap(
        keys,
        async (k) => {
          try {
            const r = await ingestCompraDetails(supabase, k);
            totalItems += r.items;
            totalWinners += r.winners;
            processed++;
          } catch (e) {
            errors.push(`${k}: ${e instanceof Error ? e.message : String(e)}`);
          }
        },
        COMPRA_CONCURRENCY,
      );

      await logRun(
        supabase,
        `cleanup-orfaos`,
        errors.length ? "parcial" : "sucesso",
        processed + totalItems + totalWinners,
        startedAt,
        new Date().toISOString(),
        errors.slice(0, 3).join(" | ") || undefined,
      );

      return new Response(
        JSON.stringify({
          ok: true,
          mode,
          orfaosProcessados: processed,
          orfaosTentados: keys.length,
          itensInseridos: totalItems,
          vencedoresInseridos: totalWinners,
          errors: errors.slice(0, 10),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // mode "dia": ingere UM único dia de contratos, com retomada por página.
    // Roda até um deadline curto e devolve o dia para a fila apontando a próxima página.
    if (mode === "dia") {
      const dia = String(body.dia || "");
      if (!/^\d{8}$/.test(dia)) {
        return new Response(JSON.stringify({ error: "dia YYYYMMDD required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const startPage = Math.max(1, Number(body.paginaInicial) || 1);
      const diaIso = `${dia.slice(0, 4)}-${dia.slice(4, 6)}-${dia.slice(6, 8)}`;
      try {
        const win = await ingestContratosWindow(supabase, dia, dia, {
          startPage,
          deadline: Date.now() + 55_000,
          skipRaw: true,
        });
        const finished = win.nextPage === null;
        const ok = finished && win.errors.length === 0;
        await supabase.rpc("mark_contratos_dia", {
          p_dia: diaIso,
          p_status: ok ? "done" : "pending",
          p_contratos: win.contratos,
          p_error: win.errors.slice(0, 2).join(" | ") || null,
          p_pagina: win.nextPage ?? 1,
          p_acumula: startPage > 1,
        });
        await logRun(
          supabase,
          `contratos/dia`,
          ok ? "sucesso" : "parcial",
          win.contratos,
          dia,
          dia,
          win.errors.slice(0, 2).join(" | ") || undefined,
        );
        return new Response(JSON.stringify({ ok, mode, dia, startPage, ...win }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await supabase.rpc("mark_contratos_dia", {
          p_dia: diaIso,
          p_status: "pending",
          p_contratos: 0,
          p_error: msg,
          p_pagina: startPage,
          p_acumula: false,
        });
        throw e;
      }
    }



    let dataInicial: string;
    let dataFinal: string;

    if (mode === "backfill") {
      dataInicial = String(body.dataInicial || "");
      dataFinal = String(body.dataFinal || "");
      if (!/^\d{8}$/.test(dataInicial) || !/^\d{8}$/.test(dataFinal)) {
        return new Response(JSON.stringify({ error: "dataInicial/dataFinal YYYYMMDD required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // daily: read cursor, advance 1 day
      const { data: cursor } = await supabase
        .from("sync_status")
        .select("last_date_processed")
        .eq("api_source", "pncp-dadosabertos-contratos")
        .eq("modalidade", 0)
        .maybeSingle();

      let next = cursor?.last_date_processed && /^\d{8}$/.test(cursor.last_date_processed)
        ? addDays(cursor.last_date_processed, 1)
        : "20240101"; // historical start

      const today = todayYmd();
      if (next > today) next = today;
      dataInicial = next;
      dataFinal = next;
    }

    // 1) Walk contratos for window
    const win = await ingestContratosWindow(supabase, dataInicial, dataFinal);

    // 2) For each unique compra discovered, fetch items + resultados
    // (We re-extract from pncp_raw rows just inserted)
    const { data: compraRaw } = await supabase
      .from("pncp_raw")
      .select("payload")
      .eq("tipo", "contrato")
      .gte("coletado_em", startedAt)
      .limit(2000);

    const uniqueCompras = new Set<string>();
    for (const r of compraRaw ?? []) {
      const k = (r.payload as any)?.numeroControlePncpCompra;
      if (k) uniqueCompras.add(k);
    }

    let totalItems = 0;
    let totalWinners = 0;
    await pMap(
      [...uniqueCompras],
      async (k) => {
        const r = await ingestCompraDetails(supabase, k);
        totalItems += r.items;
        totalWinners += r.winners;
      },
      COMPRA_CONCURRENCY,
    );

    // 3) Advance cursor on daily mode
    if (mode === "daily") {
      await supabase
        .from("sync_status")
        .update({ last_date_processed: dataFinal, total_synced: win.contratos })
        .eq("api_source", "pncp-dadosabertos-contratos")
        .eq("modalidade", 0);
    }

    await logRun(
      supabase,
      `contratos+itens+resultados`,
      win.errors.length ? "parcial" : "sucesso",
      win.contratos + totalItems + totalWinners,
      dataInicial,
      dataFinal,
      win.errors.slice(0, 3).join(" | ") || undefined,
    );

    return new Response(
      JSON.stringify({
        ok: true,
        mode,
        window: { dataInicial, dataFinal },
        pages: win.pages,
        contratos: win.contratos,
        comprasUnicas: uniqueCompras.size,
        itensInseridos: totalItems,
        vencedoresInseridos: totalWinners,
        errors: win.errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logRun(supabase, "fatal", "erro", 0, startedAt, new Date().toISOString(), msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
