import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PHASES = ["pncp", "winners", "contratos", "sancionados"] as const;
type Phase = typeof PHASES[number];

type PhaseTiming = {
  startedAt: string;
  finishedAt?: string;
  recordsProcessed: number;
};

type WatchdogState = {
  lastProgressAt?: string;
  lastProgressKey?: string;
  stalledSince?: string | null;
  stallCount?: number;
  nextRetryAt?: string | null;
  lastRestartAt?: string;
  lastKickAt?: string;
  retries?: Record<string, number>;
};

const PHASE_LABELS: Record<Phase, string> = {
  pncp: "Ingerindo licitações do PNCP",
  winners: "Buscando vencedores das homologadas",
  contratos: "Ingerindo contratos do Portal da Transparência",
  sancionados: "Atualizando empresas sancionadas (CEIS/CNEP)",
  
};

const MODALIDADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
// Hard cap to prevent infinite pagination loops when the PNCP API keeps returning hasMore=true
// indefinitely. The real PNCP limit is ~200 pages (10k records) per window/modalidade.
const PNCP_MAX_PAGES_PER_MODALIDADE = 250;
const WINNERS_BATCH_LIMIT = 1000;
const WATCHDOG_STALL_MS = 3 * 60_000;
const WATCHDOG_BASE_BACKOFF_MS = 30_000;
const WATCHDOG_MAX_BACKOFF_MS = 10 * 60_000;
const WATCHDOG_MAX_RETRIES = 6;

function fmtDate(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function todayYYYYMMDD() {
  return fmtDate(new Date());
}

function daysAgoYYYYMMDD(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return fmtDate(d);
}

function parseIsoMs(value?: string | null) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function formatDelay(ms: number) {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

function makeProgressKey(
  phase: Phase | null,
  phasesCompleted: number,
  phaseProgressCurrent: number,
  phaseProgressTotal: number,
  totalRecords: number,
) {
  return [phase ?? "done", phasesCompleted, phaseProgressCurrent, phaseProgressTotal, totalRecords].join("|");
}

function nextBackoff(retryCount: number) {
  return Math.min(
    WATCHDOG_MAX_BACKOFF_MS,
    WATCHDOG_BASE_BACKOFF_MS * Math.pow(2, Math.max(0, retryCount - 1)),
  );
}

async function selfSchedule(jobId: string) {
  fetch(`${SUPABASE_URL}/functions/v1/pipeline-orchestrator`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ jobId, internal: true }),
  }).catch((e) => console.error("self-schedule failed:", e));
}

async function invokeFn(name: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, text };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const jobId: string | undefined = body.jobId;
  if (!jobId) {
    return new Response(JSON.stringify({ error: "jobId required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: job, error: loadErr } = await supabase
    .from("ingestion_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (loadErr || !job) {
    return new Response(JSON.stringify({ error: "job not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (["cancelled", "completed", "failed"].includes(job.status)) {
    return new Response(JSON.stringify({ ok: true, finalStatus: job.status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const state: any = job.state || {};
  const watchdog: WatchdogState = state.__watchdog || {};
  let phase: Phase = (job.current_phase as Phase) || "pncp";
  let phasesCompleted = job.phases_completed || 0;
  let totalRecords = job.total_records_processed || 0;
  let phaseProgressCurrent = job.phase_progress_current || 0;
  let phaseProgressTotal = job.phase_progress_total || 0;
  const initialProgressKey = makeProgressKey(
    phase,
    phasesCompleted,
    phaseProgressCurrent,
    phaseProgressTotal,
    totalRecords,
  );

  if (!watchdog.lastProgressKey) watchdog.lastProgressKey = initialProgressKey;
  if (!watchdog.lastProgressAt) watchdog.lastProgressAt = job.started_at || job.created_at || nowIso;

  const nextRetryAtMs = parseIsoMs(watchdog.nextRetryAt);
  if (nextRetryAtMs && nextRetryAtMs > nowMs) {
    return new Response(JSON.stringify({ ok: true, sleepingUntil: watchdog.nextRetryAt }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (job.status === "pending") {
    await supabase
      .from("ingestion_jobs")
      .update({
        status: "running",
        started_at: nowIso,
        current_phase: phase,
        phase_label: PHASE_LABELS[phase],
        last_tick_at: nowIso,
      })
      .eq("id", jobId);
  }

  let advancePhase = false;
  let phaseRecords = 0;
  let phaseError: string | null = null;
  let needsBackoff = false;
  let phaseLabelOverride: string | null = null;

  try {
    if (phase === "pncp") {
      const dataInicial = state.dataInicial || daysAgoYYYYMMDD(7);
      const dataFinal = state.dataFinal || todayYYYYMMDD();
      const modIdx = state.modIdx ?? 0;
      const pagina = state.pagina ?? 1;

      if (modIdx >= MODALIDADES.length) {
        advancePhase = true;
      } else {
        const modalidade = MODALIDADES[modIdx];
        const result = await invokeFn("ingest-pncp", {
          dataInicial,
          dataFinal,
          modalidade,
          pagina,
        });

        if (result.ok && result.json) {
          phaseRecords = Number(result.json.totalProcessed || 0);
          totalRecords += phaseRecords;
          const hasMore = !!result.json.hasMore;
          const reachedPageCap = pagina >= PNCP_MAX_PAGES_PER_MODALIDADE;

          if (reachedPageCap && hasMore) {
            console.warn(`PNCP page cap (${PNCP_MAX_PAGES_PER_MODALIDADE}) reached for mod ${modalidade} — advancing to next modalidade to prevent infinite loop.`);
          }

          if (hasMore && !reachedPageCap) {
            state.pagina = pagina + 1;
          } else {
            state.modIdx = modIdx + 1;
            state.pagina = 1;
          }

          state.dataInicial = dataInicial;
          state.dataFinal = dataFinal;
          phaseProgressCurrent = Number(state.modIdx || 0);
          phaseProgressTotal = MODALIDADES.length;
        } else {
          phaseError = `PNCP mod ${modalidade} pág ${pagina}: HTTP ${result.status} ${(result.text || "").slice(0, 200)}`;
          needsBackoff = true;
        }
      }
    } else if (phase === "winners") {
      const result = await invokeFn("ingest-pncp", {
        mode: "winners",
        limit: WINNERS_BATCH_LIMIT,
      });

      if (result.ok && result.json && result.json.success !== false) {
        const processed = Number(result.json.processed || 0);
        const winners = Number(result.json.winnersFound || 0);
        phaseRecords = processed;
        totalRecords += winners;
        phaseProgressCurrent = Number(state.processed || 0) + processed;
        state.processed = phaseProgressCurrent;
        phaseProgressTotal = phaseProgressCurrent + (result.json.hasMore ? 100 : 0);
        if (!result.json.hasMore) advancePhase = true;
      } else {
        // Either HTTP error or { success:false, retryable:true } from the worker.
        const err = result.json?.error || `HTTP ${result.status}`;
        phaseError = `Vencedores: ${err}`.slice(0, 240);
        needsBackoff = true;
      }
    } else if (phase === "contratos") {
      const dataInicial = state.cDataInicial || daysAgoYYYYMMDD(7).replace(/(\d{4})(\d{2})(\d{2})/, "$3/$2/$1");
      const dataFinal = state.cDataFinal || todayYYYYMMDD().replace(/(\d{4})(\d{2})(\d{2})/, "$3/$2/$1");
      const pagina = state.cPagina || 1;
      const result = await invokeFn("ingest-contratos", {
        mode: "bulk-contratos",
        dataInicial,
        dataFinal,
        pagina,
        maxPages: 50,
      });

      if (result.ok && result.json) {
        const processed = Number(result.json.totalProcessed || 0);
        phaseRecords = processed;
        totalRecords += processed;
        phaseProgressCurrent = Number(state.cProcessed || 0) + processed;
        state.cProcessed = phaseProgressCurrent;
        state.cDataInicial = dataInicial;
        state.cDataFinal = dataFinal;
        phaseProgressTotal = phaseProgressCurrent + (result.json.hasMore ? 500 : 0);
        if (result.json.hasMore) {
          state.cPagina = pagina + 1;
        } else {
          advancePhase = true;
        }
      } else {
        phaseError = `Contratos: HTTP ${result.status} ${(result.text || "").slice(0, 200)}`;
        needsBackoff = true;
      }
    } else if (phase === "sancionados") {
      const result = await invokeFn("ingest-ceis-cnep", {});
      if (result.ok && result.json) {
        phaseRecords = Number(result.json.totalProcessed || 0);
        totalRecords += phaseRecords;
        advancePhase = true;
        phaseProgressCurrent = 1;
        phaseProgressTotal = 1;
      } else {
        phaseError = `Sancionados: HTTP ${result.status} ${(result.text || "").slice(0, 200)}`;
        needsBackoff = true;
      }
    }
  } catch (err) {
    phaseError = err instanceof Error ? err.message : String(err);
    needsBackoff = true;
    console.error("tick error", err);
  }

  const phaseTimings: Record<string, PhaseTiming> = state.__phaseTimings || {};
  if (!phaseTimings[phase]) {
    phaseTimings[phase] = { startedAt: nowIso, recordsProcessed: 0 };
  }
  phaseTimings[phase].recordsProcessed += phaseRecords;

  let nextPhase: Phase | null = phase;
  if (advancePhase) {
    phasesCompleted += 1;
    phaseTimings[phase].finishedAt = nowIso;
    const idx = PHASES.indexOf(phase);

    if (idx + 1 >= PHASES.length) {
      nextPhase = null;
    } else {
      nextPhase = PHASES[idx + 1];
      Object.keys(state).forEach((key) => {
        if (key !== "__phaseTimings" && key !== "__watchdog") delete state[key];
      });
      phaseProgressCurrent = 0;
      phaseProgressTotal = 0;
    }
  }

  const afterProgressKey = makeProgressKey(
    nextPhase,
    phasesCompleted,
    phaseProgressCurrent,
    phaseProgressTotal,
    totalRecords,
  );
  let progressed = initialProgressKey !== afterProgressKey;

  if (!progressed && !needsBackoff && nextPhase !== null) {
    const lastProgressAtMs = parseIsoMs(watchdog.lastProgressAt) ?? nowMs;
    if (nowMs - lastProgressAtMs >= WATCHDOG_STALL_MS) {
      phaseError = phaseError || `Sem progresso na fase ${phase} há ${formatDelay(nowMs - lastProgressAtMs)}`;
      needsBackoff = true;
    }
  }

  let finalStatus: "running" | "completed" | "failed" = nextPhase === null ? "completed" : "running";
  let suppressImmediateReschedule = false;

  if (progressed) {
    watchdog.lastProgressAt = nowIso;
    watchdog.lastProgressKey = afterProgressKey;
    watchdog.stalledSince = null;
    watchdog.stallCount = 0;
    watchdog.nextRetryAt = null;
    watchdog.retries = { ...(watchdog.retries || {}), [phase]: 0 };
  } else if (nextPhase !== null) {
    watchdog.stallCount = (watchdog.stallCount || 0) + 1;
    watchdog.stalledSince = watchdog.stalledSince || watchdog.lastProgressAt || nowIso;
  }

  if (needsBackoff && nextPhase !== null) {
    const retries = { ...(watchdog.retries || {}) };
    const retryCount = (retries[phase] || 0) + 1;
    retries[phase] = retryCount;
    watchdog.retries = retries;

    if (retryCount > WATCHDOG_MAX_RETRIES) {
      finalStatus = "failed";
      phaseError = `Watchdog excedeu ${WATCHDOG_MAX_RETRIES} tentativas automáticas na fase ${phase}. Último erro: ${phaseError || "sem detalhes"}`;
      phaseLabelOverride = `Falhou na fase ${phase}`;
    } else {
      const backoffMs = nextBackoff(retryCount);
      watchdog.nextRetryAt = new Date(nowMs + backoffMs).toISOString();
      watchdog.lastRestartAt = nowIso;
      suppressImmediateReschedule = true;
      phaseLabelOverride = `${PHASE_LABELS[phase]} · nova tentativa em ${formatDelay(backoffMs)}`;
      phaseError = `${phaseError || `Sem progresso na fase ${phase}`}. Retry ${retryCount}/${WATCHDOG_MAX_RETRIES} em ${formatDelay(backoffMs)}.`;
      if (phase === "winners") delete state.winnerErrors;
      if (phase === "contratos") delete state.cErrors;
    }
  }

  state.__phaseTimings = phaseTimings;
  state.__watchdog = watchdog;

  const { data: preCheck } = await supabase
    .from("ingestion_jobs")
    .select("status")
    .eq("id", jobId)
    .maybeSingle();

  if (preCheck?.status === "cancelled") {
    return new Response(JSON.stringify({ ok: true, cancelled: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const isDone = finalStatus !== "running";
  await supabase
    .from("ingestion_jobs")
    .update({
      status: finalStatus,
      current_phase: nextPhase,
      phase_label: phaseLabelOverride || (nextPhase ? PHASE_LABELS[nextPhase] : finalStatus === "completed" ? "Concluído" : `Falhou na fase ${phase}`),
      phases_completed: phasesCompleted,
      phase_progress_current: phaseProgressCurrent,
      phase_progress_total: phaseProgressTotal,
      total_records_processed: totalRecords,
      state,
      last_tick_at: nowIso,
      finished_at: isDone ? nowIso : null,
      error_message: phaseError,
    })
    .eq("id", jobId)
    .in("status", ["pending", "running"]);

  const { data: refreshed } = await supabase
    .from("ingestion_jobs")
    .select("status")
    .eq("id", jobId)
    .maybeSingle();

  if (refreshed?.status === "cancelled") {
    return new Response(JSON.stringify({ ok: true, cancelled: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (finalStatus === "running" && !suppressImmediateReschedule) {
    selfSchedule(jobId);
  }

  return new Response(JSON.stringify({
    ok: true,
    phase: nextPhase,
    isDone: finalStatus !== "running",
    totalRecords,
    backedOff: suppressImmediateReschedule,
    nextRetryAt: watchdog.nextRetryAt || null,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
