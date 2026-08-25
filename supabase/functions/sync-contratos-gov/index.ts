// ═══════════════════════════════════════════════════════════════════
// sync-contratos-gov
// Fonte: API pública do Contratos.gov.br (Comprasnet Contratos)
//   https://contratos.comprasnet.gov.br/api/docs
//
// Estratégia de coleta:
//   - Itera pelas unidades gestoras (UASGs) via /api/contrato/unidades
//     (paginado, retorna apenas { codigo }).
//   - Para cada UASG chama /api/contrato/ug/{codigo} e recebe TODOS os
//     contratos ATIVOS daquela UG (array cru — sem paginação interna).
//   - Para cada contrato, chama /api/contrato/{contrato_id}/empenhos e
//     grava os empenhos vinculados (fonte SIAFI, oficial).
//
// Progresso persistido em sync_state (job_name = "contratos-gov"):
//   { unidade_pagina, unidade_indice_na_pagina, concluido, ultimaExecucao }
// Orçamento de tempo de 50s como no comprasgov-collector.
// ═══════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-sync-secret",
};

const API_BASE = "https://contratos.comprasnet.gov.br";
const MAX_EXECUTION_MS = 50_000;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 15_000;
const JOB_NAME = "contratos-gov";

function parseBRL(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return 0;
  return Number(v.replace(/\./g, "").replace(",", ".")) || 0;
}

function onlyDigits(s: unknown): string {
  return String(s || "").replace(/\D+/g, "");
}

async function fetchJson(url: string): Promise<unknown> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (resp.status === 429 || resp.status >= 500) {
        lastErr = `HTTP ${resp.status}`;
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempt, 8000)));
          continue;
        }
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
      return await resp.json();
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempt, 8000)));
      }
    }
  }
  throw new Error(`Fetch failed: ${lastErr}`);
}

interface ContratoRaw {
  id: number | string;
  numero?: string;
  situacao?: string;
  objeto?: string;
  valor_global?: string | number;
  valor_acumulado?: string | number;
  vigencia_inicio?: string;
  vigencia_fim?: string;
  fornecedor?: { cnpj_cpf_idgener?: string; nome?: string };
  orgao?: { codigo?: string; nome?: string; unidade_gestora?: { codigo?: string; nome?: string; nome_resumido?: string } };
}

interface EmpenhoRaw {
  numero?: string;
  unidade_gestora?: string;
  credor_obj?: { cnpj_cpf_idgener?: string };
  credor?: string;
  empenhado?: string | number;
  liquidado?: string | number;
  pago?: string | number;
  rpinscrito?: string | number;
  data_emissao?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SYNC_SECRET = Deno.env.get("SYNC_SECRET");
  if (!SYNC_SECRET || req.headers.get("x-sync-secret") !== SYNC_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const startTime = Date.now();
  const overtime = () => Date.now() - startTime > MAX_EXECUTION_MS;

  let body: { cnpj?: string; orgao?: string; unidade?: string; reset?: boolean } = {};
  try { body = await req.json(); } catch { /* no body */ }

  const cnpjFilter = body.cnpj ? onlyDigits(body.cnpj) : null;
  const orgaoFilter = body.orgao ? String(body.orgao).trim() : null;
  const unidadeFilter = body.unidade ? String(body.unidade).trim() : null;

  // Load cursor
  type Cursor = {
    unidade_pagina?: number;
    unidade_indice?: number;
    concluido?: boolean;
    ultimaExecucao?: string;
  };
  let cursor: Cursor = { unidade_pagina: 1, unidade_indice: 0 };
  if (!body.reset && !unidadeFilter) {
    const { data } = await sb.from("sync_state").select("cursor").eq("job_name", JOB_NAME).maybeSingle();
    if (data?.cursor) cursor = data.cursor as Cursor;
  }

  // Restart from beginning when maintenance mode (concluído) and a new run is triggered
  if (cursor.concluido && !body.reset && !unidadeFilter) {
    cursor = { unidade_pagina: 1, unidade_indice: 0 };
  }

  let contratosProcessados = 0;
  let contratosUpsertados = 0;
  let empenhosUpsertados = 0;
  let errors = 0;
  let timedOut = false;
  let lastUnidadePagina = cursor.unidade_pagina || 1;
  let lastUnidadeIndice = cursor.unidade_indice || 0;
  let concluido = false;

  // ═══════════════════════════════════════════════════════════
  // Modo 1: coleta pontual de UMA unidade
  // ═══════════════════════════════════════════════════════════
  const processUnidade = async (codigo: string) => {
    let contratos: ContratoRaw[];
    try {
      contratos = (await fetchJson(`${API_BASE}/api/contrato/ug/${encodeURIComponent(codigo)}`)) as ContratoRaw[];
    } catch (e) {
      console.error(`ug ${codigo}:`, e);
      errors++;
      return;
    }
    if (!Array.isArray(contratos)) return;

    for (const c of contratos) {
      if (overtime()) { timedOut = true; return; }

      const cnpjForn = onlyDigits(c.fornecedor?.cnpj_cpf_idgener);
      const orgaoCodigo = c.orgao?.codigo || null;
      if (cnpjFilter && cnpjForn !== cnpjFilter) continue;
      if (orgaoFilter && orgaoCodigo !== orgaoFilter) continue;

      const contratoIdExterno = String(c.id);
      contratosProcessados++;

      const contratoRow = {
        contrato_id_externo: contratoIdExterno,
        numero_contrato: c.numero || null,
        unidade_codigo: c.orgao?.unidade_gestora?.codigo || codigo,
        unidade_nome: c.orgao?.unidade_gestora?.nome || c.orgao?.unidade_gestora?.nome_resumido || null,
        orgao_codigo: orgaoCodigo,
        orgao_nome: c.orgao?.nome || null,
        fornecedor_cnpj: cnpjForn || null,
        fornecedor_nome: c.fornecedor?.nome || null,
        objeto: c.objeto || null,
        valor_global: parseBRL(c.valor_global),
        valor_acumulado: parseBRL(c.valor_acumulado),
        vigencia_inicio: c.vigencia_inicio || null,
        vigencia_fim: c.vigencia_fim || null,
        situacao: c.situacao || null,
        updated_at: new Date().toISOString(),
      };

      const { error: upErr } = await sb
        .from("contratos_gestao")
        .upsert(contratoRow, { onConflict: "contrato_id_externo" });
      if (upErr) { errors++; console.error("upsert contrato:", upErr.message); continue; }
      contratosUpsertados++;

      // Empenhos do contrato
      try {
        const emps = (await fetchJson(`${API_BASE}/api/contrato/${contratoIdExterno}/empenhos`)) as EmpenhoRaw[];
        if (Array.isArray(emps) && emps.length > 0) {
          const rows = emps
            .filter((e) => e.numero)
            .map((e) => ({
              contrato_id_externo: contratoIdExterno,
              numero_empenho: String(e.numero),
              unidade_gestora: e.unidade_gestora || null,
              fornecedor_cnpj:
                onlyDigits(e.credor_obj?.cnpj_cpf_idgener) ||
                onlyDigits((e.credor || "").split(" - ")[0]) ||
                cnpjForn ||
                null,
              valor_empenhado: parseBRL(e.empenhado),
              valor_liquidado: parseBRL(e.liquidado),
              valor_pago: parseBRL(e.pago),
              valor_rp_inscrito: parseBRL(e.rpinscrito),
              data_emissao: e.data_emissao || null,
              updated_at: new Date().toISOString(),
            }));

          if (rows.length > 0) {
            const { error: eErr } = await sb
              .from("contrato_empenhos")
              .upsert(rows, { onConflict: "contrato_id_externo,numero_empenho" });
            if (eErr) { errors++; console.error("upsert empenhos:", eErr.message); }
            else empenhosUpsertados += rows.length;
          }
        }
      } catch (e) {
        console.error(`empenhos ${contratoIdExterno}:`, e);
        errors++;
      }
    }
  };

  try {
    if (unidadeFilter) {
      // ─── Modo ad-hoc: uma UASG específica
      await processUnidade(unidadeFilter);
    } else {
      // ─── Modo progressivo: itera unidades paginadas
      let unidadePagina = cursor.unidade_pagina || 1;
      let unidadeIndice = cursor.unidade_indice || 0;

      while (!timedOut) {
        if (overtime()) { timedOut = true; break; }

        let unidades: { codigo: string }[];
        try {
          unidades = (await fetchJson(`${API_BASE}/api/contrato/unidades?pagina=${unidadePagina}`)) as { codigo: string }[];
        } catch (e) {
          console.error(`unidades page ${unidadePagina}:`, e);
          errors++;
          break;
        }
        if (!Array.isArray(unidades) || unidades.length === 0) {
          // Fim da lista de unidades → coleta concluída (dá a volta a cada rodada de manutenção)
          concluido = true;
          break;
        }

        for (let i = unidadeIndice; i < unidades.length; i++) {
          if (overtime()) { timedOut = true; break; }
          const codigo = unidades[i]?.codigo;
          if (!codigo) continue;
          await processUnidade(codigo);
          lastUnidadePagina = unidadePagina;
          lastUnidadeIndice = i + 1;
        }

        if (timedOut) break;
        // Página consumida — avança
        unidadePagina++;
        unidadeIndice = 0;
        lastUnidadePagina = unidadePagina;
        lastUnidadeIndice = 0;
      }
    }
  } catch (e) {
    console.error("Fatal:", e);
    errors++;
  }

  // Persist cursor (only in progressive mode)
  if (!unidadeFilter) {
    const newCursor: Cursor = concluido
      ? { unidade_pagina: 1, unidade_indice: 0, concluido: true, ultimaExecucao: new Date().toISOString() }
      : { unidade_pagina: lastUnidadePagina, unidade_indice: lastUnidadeIndice };

    await sb
      .from("sync_state")
      .upsert(
        { job_name: JOB_NAME, cursor: newCursor as unknown as Record<string, unknown>, updated_at: new Date().toISOString() },
        { onConflict: "job_name" },
      );
  }

  const elapsed = Date.now() - startTime;
  const paginationIssue = timedOut && !concluido;
  const status = errors > 0 && contratosUpsertados === 0
    ? "error"
    : paginationIssue
      ? "partial"
      : "success";

  await sb.from("api_logs").insert({
    api_name: "sync-contratos-gov",
    endpoint: unidadeFilter
      ? `/api/contrato/ug/${unidadeFilter}`
      : `unidades pagina=${lastUnidadePagina} idx=${lastUnidadeIndice}${concluido ? " (concluído)" : ""}`,
    status,
    records_imported: contratosUpsertados,
    http_status: 200,
    response_time_ms: elapsed,
    error_message:
      errors > 0 || paginationIssue
        ? `errors=${errors} timedOut=${timedOut} empenhos=${empenhosUpsertados}`
        : null,
  });

  return new Response(
    JSON.stringify({
      success: true,
      job: JOB_NAME,
      status,
      contratosProcessados,
      contratosUpsertados,
      empenhosUpsertados,
      errors,
      timedOut,
      concluido,
      cursor: { unidade_pagina: lastUnidadePagina, unidade_indice: lastUnidadeIndice, concluido },
      elapsedMs: elapsed,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
