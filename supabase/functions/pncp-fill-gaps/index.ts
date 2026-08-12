// pncp-fill-gaps
// Regra de ouro: garantir que nenhuma licitação com resultado publicado no PNCP
// fique fora do nosso banco.
//
// Dois modos:
//  - mode="gaps": detecta saltos na sequência de compras por (cnpj, ano) já
//    ingeridas e reingere as faltantes puxando a compra + itens + resultados
//    diretamente do PNCP.
//  - mode="reprocess-winners": para toda licitação que sabemos ter resultado
//    (homologada ou com existeResultado=true) mas está sem vencedores no banco,
//    refetch dos itens + resultados.
//
// Chamado apenas via cron (com SERVICE_ROLE_KEY) ou por admin autenticado.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PncpMetrics } from "../_shared/pncp-metrics.ts";

const metrics = new PncpMetrics("pncp-fill-gaps");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PNCP_CONSULTA_URL = "https://pncp.gov.br/api/consulta/v1";
const PNCP_DATA_URL = "https://pncp.gov.br/api/pncp/v1";
const FETCH_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 3;

// Global counters populated during a run and flushed to ingestao_logs.details
// so the autoscaler can react to pressure signals.
const runMetrics = {
  http_429: 0,
  http_5xx: 0,
  fetch_timeouts: 0,
};
let runtimeParallel = 10;


function backoff(attempt: number, base: number) {
  const jitter = Math.floor(Math.random() * 400);
  return base * Math.pow(2, attempt) + jitter;
}

// Cooldown global: quando o PNCP responde 429, todas as tarefas do run
// esperam até este timestamp antes de disparar novas requisições.
let throttleUntil = 0;
async function waitForThrottle() {
  const wait = throttleUntil - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

async function fetchWithTimeout(url: string): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await waitForThrottle();
    const ctrl = new AbortController();
    // timeout adaptativo: cada retentativa espera um pouco mais
    const timeoutMs = FETCH_TIMEOUT_MS + attempt * 10_000;
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (resp.status === 429) {
        runMetrics.http_429++;
        // pressão da fonte: reduz o paralelismo e aplica cooldown global
        runtimeParallel = Math.max(2, Math.floor(runtimeParallel * 0.6));
        const retryAfter = Number(resp.headers.get("retry-after"));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 20_000)
          : backoff(attempt, 2500);
        throttleUntil = Math.max(throttleUntil, Date.now() + waitMs);
        await waitForThrottle();
        continue;
      }
      if (resp.status >= 500) {
        runMetrics.http_5xx++;
        await new Promise((r) => setTimeout(r, backoff(attempt, 1200)));
        continue;
      }
      return resp;
    } catch (e) {
      clearTimeout(timer);
      runMetrics.fetch_timeouts++;
      lastErr = e;
      await new Promise((r) => setTimeout(r, backoff(attempt, 800)));
    }
  }
  throw new Error(
    lastErr instanceof Error
      ? `fetch_failed:${lastErr.message || "timeout"}`
      : `fetch_failed:${String(lastErr ?? "timeout")}`,
  );
}




function mapCompra(c: any) {
  return {
    id_origem: c.numeroControlePNCP,
    fonte: "PNCP" as const,
    orgao: c.orgaoEntidade?.razaoSocial || "Não informado",
    modalidade: c.modalidadeNome || null,
    objeto: c.objetoCompra || "Sem descrição",
    data_publicacao: c.dataPublicacaoPncp ? c.dataPublicacaoPncp.split("T")[0] : null,
    data_resultado: c.dataResultadoCompra ? c.dataResultadoCompra.split("T")[0] : null,
    valor_estimado: c.valorTotalEstimado ?? null,
    valor_homologado: c.valorTotalHomologado ?? null,
    situacao: c.situacaoCompraNome || null,
    numero_controle_pncp: c.numeroControlePNCP || null,
    uf: c.unidadeOrgao?.ufSigla || null,
    municipio: c.unidadeOrgao?.municipioNome || null,
    raw_json: c,
  };
}

/** Ingest a single compra (cnpj/ano/seq): fetches compra + itens + resultados,
 *  upserts everything. Returns {ok, winners, note}. */
async function ingestCompra(
  supabase: any,
  cnpj: string,
  ano: number,
  seq: number,
  withWinners = true
): Promise<{ ok: boolean; winners: number; note?: string; licitacaoId?: string }> {
  // 1) fetch compra metadata
  const compraUrl = `${PNCP_CONSULTA_URL}/orgaos/${cnpj}/compras/${ano}/${seq}`;
  const compraResp = await fetchWithTimeout(compraUrl);
  if (compraResp.status === 404) {
    return { ok: false, winners: 0, note: "not_found_in_pncp" };
  }
  if (!compraResp.ok) {
    return { ok: false, winners: 0, note: `compra_http_${compraResp.status}` };
  }
  const compra = await compraResp.json();
  if (!compra?.numeroControlePNCP) {
    return { ok: false, winners: 0, note: "compra_missing_numero" };
  }

  // 2) upsert licitacao
  const row = mapCompra(compra);
  const { data: upserted, error: upErr } = await supabase
    .from("licitacoes")
    .upsert(row, { onConflict: "numero_controle_pncp" })
    .select("id")
    .single();

  if (upErr || !upserted) {
    return { ok: false, winners: 0, note: `upsert_error:${upErr?.message}` };
  }

  const licitacaoId = upserted.id;
  if (!withWinners) return { ok: true, winners: 0, licitacaoId };
  const winners = await processWinners(supabase, licitacaoId, cnpj, ano, seq);
  return { ok: true, winners, licitacaoId };
}

/** Fetch itens + resultados for a given (cnpj, ano, seq) and upsert them,
 *  linking to an already-existing licitacao row. */
async function processWinners(
  supabase: any,
  licitacaoId: string,
  cnpj: string,
  ano: number,
  seq: number
): Promise<number> {
  const itensResp = await fetchWithTimeout(
    `${PNCP_DATA_URL}/orgaos/${cnpj}/compras/${ano}/${seq}/itens`
  );
  if (!itensResp.ok) return 0;

  const itens = await itensResp.json().catch(() => null);
  if (!Array.isArray(itens) || itens.length === 0) return 0;

  const itemRows = itens
    .filter((it: any) => it.numeroItem || it.sequencialItem)
    .map((it: any) => ({
      licitacao_id: licitacaoId,
      descricao: it.descricao || it.materialOuServico || "Item",
      numero_item: it.numeroItem || it.sequencialItem,
      quantidade: it.quantidade ?? null,
      unidade: it.unidadeMedida ?? null,
      valor_unitario_estimado: it.valorUnitarioEstimado ?? null,
    }));

  if (itemRows.length === 0) return 0;

  const { error: iErr } = await supabase
    .from("licitacao_itens")
    .upsert(itemRows, { onConflict: "licitacao_id,numero_item", ignoreDuplicates: true });
  if (iErr) return 0;

  const numeros = itemRows.map((r) => r.numero_item);
  const { data: dbItems } = await supabase
    .from("licitacao_itens")
    .select("id, numero_item")
    .eq("licitacao_id", licitacaoId)
    .in("numero_item", numeros);

  if (!dbItems || dbItems.length === 0) return 0;

  const idMap: Record<number, string> = {};
  for (const di of dbItems) idMap[di.numero_item] = di.id;

  const withResults = itens.filter(
    (it: any) => it.temResultado && (it.numeroItem || it.sequencialItem)
  );

  let winnersFound = 0;
  const PARALLEL = Math.max(2, Math.min(runtimeParallel, 6));

  for (let i = 0; i < withResults.length; i += PARALLEL) {
    const batch = withResults.slice(i, i + PARALLEL);
    const results = await Promise.allSettled(
      batch.map(async (it: any) => {
        const sItem = it.numeroItem || it.sequencialItem;
        const dbItemId = idMap[sItem];
        if (!dbItemId) return 0;

        const rResp = await fetchWithTimeout(
          `${PNCP_DATA_URL}/orgaos/${cnpj}/compras/${ano}/${seq}/itens/${sItem}/resultados`
        );
        if (!rResp.ok) return 0;
        const resultados = await rResp.json().catch(() => null);
        const rList = Array.isArray(resultados)
          ? resultados
          : resultados
          ? [resultados]
          : [];

        const winnerRows = rList
          .filter((r: any) => r?.nomeRazaoSocialFornecedor || r?.niFornecedor)
          .map((r: any) => ({
            item_id: dbItemId,
            razao_social: r.nomeRazaoSocialFornecedor || "Não informado",
            cnpj: r.niFornecedor || null,
            valor_final: r.valorTotalHomologado ?? r.valorUnitarioHomologado ?? null,
            percentual_desconto: r.percentualDesconto ?? null,
          }));

        if (winnerRows.length === 0) return 0;
        const { error: wErr } = await supabase
          .from("licitacao_vencedores")
          .upsert(winnerRows, { onConflict: "item_id,cnpj", ignoreDuplicates: true });
        return wErr ? 0 : winnerRows.length;
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled") winnersFound += r.value;
    }
  }

  return winnersFound;
}

async function authenticateRequest(req: Request, supabase: any): Promise<
  { ok: true } | { ok: false; status: number; msg: string }
> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, status: 401, msg: "missing_token" };

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (serviceKey && token === serviceKey) return { ok: true };

  // Otherwise require an admin_central user.
  const { data: u, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !u?.user) return { ok: false, status: 401, msg: "invalid_token" };
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", u.user.id);
  const isAdmin = (roles || []).some(
    (r: any) => r.role === "admin_central" || r.role === "admin"
  );
  if (!isAdmin) return { ok: false, status: 403, msg: "forbidden" };
  return { ok: true };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const authRes = await authenticateRequest(req, supabase);
  if (!authRes.ok) {
    return new Response(JSON.stringify({ error: authRes.msg }), {
      status: authRes.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const mode: string = body.mode || "gaps";

  // Autoscale: if no explicit limit or autoscale=true, read tuned params.
  let tunedLimit = 200;
  let tunedParallel = 10;
  if (body.autoscale || body.limit == null) {
    const { data: state } = await supabase
      .rpc("get_autoscale_state", { p_target: mode });
    const row = Array.isArray(state) ? state[0] : state;
    if (row) {
      tunedLimit = Number(row.limit_per_run) || tunedLimit;
      tunedParallel = Number(row.parallelism) || tunedParallel;
    }
  }
  const limit: number = Math.max(
    1,
    Math.min(Number(body.limit) || tunedLimit, 3000),
  );
  runtimeParallel = Math.max(1, Math.min(tunedParallel, 40));

  const startedAt = Date.now();
  runMetrics.http_429 = 0;
  runMetrics.http_5xx = 0;
  runMetrics.fetch_timeouts = 0;

  const runLog = {
    mode,
    limit,
    parallel: runtimeParallel,
    processed: 0,
    inserted: 0,
    winners: 0,
    notFound: 0,
    errors: [] as string[],
  };


  // Hard deadline so we always flush the run log before the platform kills us.
  const DEADLINE_MS = Number(body.deadlineMs) ||
    (mode === "gaps" ? 110_000 : 240_000);
  const outOfTime = () => Date.now() - startedAt > DEADLINE_MS;

  async function runPool<T>(items: T[], worker: (item: T) => Promise<void>) {
    const size = Math.max(1, Math.min(runtimeParallel, 40));
    let cursor = 0;
    const workers = Array.from({ length: size }, async () => {
      while (true) {
        if (outOfTime()) return;
        const idx = cursor++;
        if (idx >= items.length) return;
        await worker(items[idx]);
      }
    });
    await Promise.all(workers);
  }

  try {
    if (mode === "gaps") {
      // Fila persistente: claim rápido por índice (a detecção de lacunas roda
      // em cron separado, fora do caminho crítico).
      // Nesta fase só gravamos a licitação (1 request por registro) — os
      // vencedores são resolvidos pelo cron reprocess-winners, o que multiplica
      // a velocidade de cobertura sem perder a regra de ouro.
      const withWinners = body.withWinners === true;
      const { data: gaps, error } = await supabase.rpc("claim_gap_batch", {
        p_limit: limit,
      });
      if (error) throw new Error(`claim_gap_batch: ${error.message}`);

      const pendingMarks: any[] = [];
      const flushMarks = async (force = false) => {
        if (pendingMarks.length === 0) return;
        if (!force && pendingMarks.length < 100) return;
        const batch = pendingMarks.splice(0, pendingMarks.length);
        const { error: mErr } = await supabase.rpc("mark_gap_results", {
          p_results: batch,
        });
        if (mErr) runLog.errors.push(`mark_gap_results: ${mErr.message}`);
      };

      await runPool(gaps || [], async (g: any) => {
        runLog.processed++;
        let status = "error";
        let errMsg: string | null = null;
        try {
          const r = await ingestCompra(supabase, g.cnpj, g.ano, g.seq, withWinners);
          if (r.ok) {
            runLog.inserted++;
            runLog.winners += r.winners;
            status = "done";
          } else if (r.note === "not_found_in_pncp") {
            runLog.notFound++;
            status = "not_found";
            errMsg = "not_found_in_pncp";
          } else {
            errMsg = String(r.note ?? "erro_desconhecido");
            runLog.errors.push(`${g.cnpj}/${g.ano}/${g.seq}: ${errMsg}`);
          }
        } catch (e) {
          const raw = e instanceof Error ? e.message : String(e);
          errMsg = raw && raw !== "null" && raw !== "undefined"
            ? raw
            : "erro_desconhecido";
          runLog.errors.push(`${g.cnpj}/${g.ano}/${g.seq}: ${errMsg}`);
        }
        pendingMarks.push({
          cnpj: g.cnpj,
          ano: g.ano,
          seq: g.seq,
          status,
          error: errMsg,
        });
        await flushMarks();
      });
      await flushMarks(true);
    } else if (mode === "refresh-queue") {
      const { data, error } = await supabase.rpc("refresh_pncp_gap_queue", {
        p_min_ano: body.minAno ?? 2023,
      });
      if (error) throw new Error(`refresh_pncp_gap_queue: ${error.message}`);
      const row = Array.isArray(data) ? data[0] : data;
      runLog.processed = Number(row?.inserted ?? 0);
      runLog.inserted = Number(row?.inserted ?? 0);
    } else if (mode === "reprocess-winners") {

      const { data: rows, error } = await supabase.rpc(
        "pncp_licitacoes_para_reprocessar",
        { p_limit: limit }
      );
      if (error) throw new Error(`rpc_reprocess: ${error.message}`);
      await runPool(rows || [], async (r: any) => {
        runLog.processed++;
        try {
          const w = await processWinners(supabase, r.id, r.cnpj, r.ano, r.seq);
          runLog.winners += w;
        } catch (e) {
          runLog.errors.push(`${r.numero_controle_pncp}: ${(e as Error).message}`);
        }
      });
    } else if (mode === "backfill-itens") {
      // Preenche itens de licitações que não têm nenhum item cadastrado
      // (inclusive as não homologadas), garantindo cobertura do filtro por item.
      const { data: rows, error } = await supabase.rpc(
        "pncp_licitacoes_sem_itens_para_ingestao",
        { p_limit: limit },
      );
      if (error) throw new Error(`rpc_backfill_itens: ${error.message}`);
      await runPool(rows || [], async (r: any) => {
        runLog.processed++;
        try {
          const w = await processWinners(supabase, r.id, r.cnpj, r.ano, r.seq);
          runLog.winners += w;
          runLog.inserted++;
        } catch (e) {
          const raw = e instanceof Error ? e.message : String(e);
          runLog.errors.push(
            `${r.numero_controle_pncp}: ${raw || "erro_desconhecido"}`,
          );
        }
      });
    } else if (mode === "orgao") {
      // Varredura direcionada: força um CNPJ/ano na frente da fila.
      const cnpj = String(body.cnpj || "").replace(/\D/g, "");
      if (cnpj.length !== 14) throw new Error("cnpj_invalido");
      const anos: number[] = Array.isArray(body.anos) && body.anos.length
        ? body.anos.map((a: any) => Number(a)).filter((a: number) => a >= 2021 && a <= 2100)
        : [Number(body.ano) || new Date().getFullYear()];
      const seqFrom = Math.max(1, Number(body.seqFrom) || 1);
      const seqTo = Number(body.seqTo) || 0; // 0 = auto (para em N 404s seguidos)
      const MAX_MISSES = Math.max(10, Number(body.maxMisses) || 60);
      const HARD_CAP = Math.min(Number(body.maxSeq) || 3000, 10000);

      for (const ano of anos) {
        let seq = seqFrom;
        let consecutiveMisses = 0;
        while (!outOfTime()) {
          const batchSize = Math.max(1, Math.min(runtimeParallel, 12));
          const batch: number[] = [];
          for (let k = 0; k < batchSize; k++) {
            const s = seq + k;
            if (seqTo && s > seqTo) break;
            if (s > HARD_CAP) break;
            batch.push(s);
          }
          if (batch.length === 0) break;
          seq += batch.length;

          const results = await Promise.allSettled(
            batch.map(async (s) => {
              runLog.processed++;
              const r = await ingestCompra(supabase, cnpj, ano, s);
              if (r.ok) {
                runLog.inserted++;
                runLog.winners += r.winners;
                return true;
              }
              if (r.note === "not_found_in_pncp") {
                runLog.notFound++;
                return false;
              }
              if (r.note) runLog.errors.push(`${cnpj}/${ano}/${s}: ${r.note}`);
              return false;
            })
          );

          const anyHit = results.some((r) => r.status === "fulfilled" && r.value === true);
          consecutiveMisses = anyHit ? 0 : consecutiveMisses + batch.length;
          if (!seqTo && consecutiveMisses >= MAX_MISSES) break;
        }
      }
    } else {
      return new Response(JSON.stringify({ error: "invalid_mode" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // best-effort log
    await supabase.from("ingestao_logs").insert({
      fonte: "pncp-fill-gaps",
      endpoint: `mode=${mode}`,
      status: runLog.errors.length > 0 ? "partial" : "sucesso",
      registros_processados: runLog.processed,
      detalhes: {
        mode,
        limit,
        parallel: runtimeParallel,
        inserted: runLog.inserted,
        winners: runLog.winners,
        not_found: runLog.notFound,
        errors_sample: runLog.errors.slice(0, 20),
        duration_ms: Date.now() - startedAt,
        http_429: runMetrics.http_429,
        http_5xx: runMetrics.http_5xx,
        fetch_timeouts: runMetrics.fetch_timeouts,
      },
    });

    return new Response(
      JSON.stringify({ ok: true, ...runLog, duration_ms: Date.now() - startedAt }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = (e as Error).message;
    return new Response(
      JSON.stringify({ error: "run_failed", details: msg, ...runLog }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
