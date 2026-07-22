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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PNCP_CONSULTA_URL = "https://pncp.gov.br/api/consulta/v1";
const PNCP_DATA_URL = "https://pncp.gov.br/api/pncp/v1";
const FETCH_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;

// Global counters populated during a run and flushed to ingestao_logs.details
// so the autoscaler can react to pressure signals.
const runMetrics = {
  http_429: 0,
  http_5xx: 0,
  fetch_timeouts: 0,
};

async function fetchWithTimeout(url: string): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const resp = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (resp.status === 429) {
        runMetrics.http_429++;
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      if (resp.status >= 500) {
        runMetrics.http_5xx++;
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return resp;
    } catch (e) {
      clearTimeout(timer);
      runMetrics.fetch_timeouts++;
      lastErr = e;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
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
  seq: number
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
  const PARALLEL = 10;
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
  const limit: number = Math.max(1, Math.min(Number(body.limit) || 200, 800));
  const startedAt = Date.now();
  const runLog = {
    mode,
    limit,
    processed: 0,
    inserted: 0,
    winners: 0,
    notFound: 0,
    errors: [] as string[],
  };

  try {
    if (mode === "gaps") {
      const { data: gaps, error } = await supabase.rpc("pncp_gaps_por_orgao_ano", {
        p_limit: limit,
        p_min_ano: body.minAno ?? 2024,
      });
      if (error) throw new Error(`rpc_gaps: ${error.message}`);
      for (const g of gaps || []) {
        runLog.processed++;
        try {
          const r = await ingestCompra(supabase, g.cnpj, g.ano, g.seq);
          if (r.ok) {
            runLog.inserted++;
            runLog.winners += r.winners;
          } else if (r.note === "not_found_in_pncp") {
            runLog.notFound++;
          } else if (r.note) {
            runLog.errors.push(`${g.cnpj}/${g.ano}/${g.seq}: ${r.note}`);
          }
        } catch (e) {
          runLog.errors.push(
            `${g.cnpj}/${g.ano}/${g.seq}: ${(e as Error).message}`
          );
        }
      }
    } else if (mode === "reprocess-winners") {
      const { data: rows, error } = await supabase.rpc(
        "pncp_licitacoes_para_reprocessar",
        { p_limit: limit }
      );
      if (error) throw new Error(`rpc_reprocess: ${error.message}`);
      for (const r of rows || []) {
        runLog.processed++;
        try {
          const w = await processWinners(supabase, r.id, r.cnpj, r.ano, r.seq);
          runLog.winners += w;
        } catch (e) {
          runLog.errors.push(`${r.numero_controle_pncp}: ${(e as Error).message}`);
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
      source: "pncp-fill-gaps",
      status: runLog.errors.length > 0 ? "partial" : "success",
      records_processed: runLog.processed,
      records_inserted: runLog.inserted,
      details: {
        mode,
        winners: runLog.winners,
        not_found: runLog.notFound,
        errors_sample: runLog.errors.slice(0, 20),
        duration_ms: Date.now() - startedAt,
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
