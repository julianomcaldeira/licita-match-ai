// Pipeline orchestrator: processes one "tick" of the manual ingestion pipeline
// and self-reschedules in fire-and-forget mode until the job is complete.
//
// Phases (in order):
//   1. pncp        - ingest new biddings (last 7 days)
//   2. winners     - fetch winners for homologated biddings (loop until no more)
//   3. contratos   - ingest contracts from Portal da Transparência (last 7 days)
//   4. sancionados - refresh CEIS/CNEP
//   5. auto_analysis - run AI auto analysis
//
// Each tick advances the state and updates the ingestion_jobs row so the UI
// can show progress and ETA.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PHASES = ["pncp", "winners", "contratos", "sancionados", "auto_analysis"] as const;
type Phase = typeof PHASES[number];

const PHASE_LABELS: Record<Phase, string> = {
  pncp: "Ingerindo licitações do PNCP",
  winners: "Buscando vencedores das homologadas",
  contratos: "Ingerindo contratos do Portal da Transparência",
  sancionados: "Atualizando empresas sancionadas (CEIS/CNEP)",
  auto_analysis: "Executando auto-análise IA",
};

// Modalidades to ingest in the PNCP phase (kept small to fit in tick budget)
const MODALIDADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

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

async function selfSchedule(jobId: string) {
  // Fire-and-forget call to ourselves. We don't await the response.
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
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, json, text };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const jobId: string | undefined = body.jobId;
  if (!jobId) {
    return new Response(JSON.stringify({ error: "jobId required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Load job
  const { data: job, error: loadErr } = await supabase
    .from("ingestion_jobs").select("*").eq("id", jobId).maybeSingle();
  if (loadErr || !job) {
    return new Response(JSON.stringify({ error: "job not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (job.status === "cancelled" || job.status === "completed" || job.status === "failed") {
    return new Response(JSON.stringify({ ok: true, finalStatus: job.status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const state: any = job.state || {};
  let phase: Phase = (job.current_phase as Phase) || "pncp";
  let phasesCompleted = job.phases_completed || 0;
  let totalRecords = job.total_records_processed || 0;
  let phaseProgressCurrent = job.phase_progress_current || 0;
  let phaseProgressTotal = job.phase_progress_total || 0;

  // Mark running on first tick
  if (job.status === "pending") {
    await supabase.from("ingestion_jobs").update({
      status: "running",
      started_at: new Date().toISOString(),
      current_phase: phase,
      phase_label: PHASE_LABELS[phase],
      last_tick_at: new Date().toISOString(),
    }).eq("id", jobId);
  }

  let advancePhase = false;
  let phaseRecords = 0;
  let phaseError: string | null = null;

  try {
    if (phase === "pncp") {
      // Ingest one (modalidade, page) per tick.
      const dataInicial = state.dataInicial || daysAgoYYYYMMDD(7);
      const dataFinal = state.dataFinal || todayYYYYMMDD();
      const modIdx = state.modIdx ?? 0;
      const pagina = state.pagina ?? 1;

      if (modIdx >= MODALIDADES.length) {
        advancePhase = true;
      } else {
        const modalidade = MODALIDADES[modIdx];
        const result = await invokeFn("ingest-pncp", {
          dataInicial, dataFinal, modalidade, pagina,
        });
        if (result.ok && result.json) {
          phaseRecords = Number(result.json.totalProcessed || 0);
          totalRecords += phaseRecords;
          const hasMore = !!result.json.hasMore;
          if (hasMore) {
            state.pagina = pagina + 1;
          } else {
            state.modIdx = modIdx + 1;
            state.pagina = 1;
          }
          state.dataInicial = dataInicial;
          state.dataFinal = dataFinal;
          phaseProgressCurrent = state.modIdx;
          phaseProgressTotal = MODALIDADES.length;
        } else {
          // skip modalidade on error to keep moving, but record the error
          console.error("ingest-pncp tick failed", result.status, result.text);
          phaseError = `PNCP mod ${modalidade}: HTTP ${result.status} ${(result.text || "").slice(0, 200)}`;
          state.modIdx = modIdx + 1;
          state.pagina = 1;
        }
      }
    } else if (phase === "winners") {
      const result = await invokeFn("ingest-pncp", { mode: "winners", limit: 50 });
      if (result.ok && result.json) {
        const processed = Number(result.json.processed || 0);
        const winners = Number(result.json.winnersFound || 0);
        totalRecords += winners;
        phaseProgressCurrent = (state.processed || 0) + processed;
        state.processed = phaseProgressCurrent;
        phaseProgressTotal = phaseProgressCurrent + (result.json.hasMore ? 50 : 0);
        if (!result.json.hasMore) advancePhase = true;
      } else {
        console.error("winners tick failed", result.status, result.text);
        // tolerate transient errors a few times, then advance
        state.winnerErrors = (state.winnerErrors || 0) + 1;
        if (state.winnerErrors >= 3) advancePhase = true;
      }
    } else if (phase === "contratos") {
      const dataInicial = state.cDataInicial || daysAgoYYYYMMDD(7).replace(/(\d{4})(\d{2})(\d{2})/, "$3/$2/$1");
      const dataFinal = state.cDataFinal || todayYYYYMMDD().replace(/(\d{4})(\d{2})(\d{2})/, "$3/$2/$1");
      const pagina = state.cPagina || 1;
      const result = await invokeFn("ingest-contratos", {
        dataInicial, dataFinal, pagina,
      });
      if (result.ok && result.json) {
        const processed = Number(result.json.totalProcessed || 0);
        totalRecords += processed;
        phaseProgressCurrent = (state.cProcessed || 0) + processed;
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
        console.error("contratos tick failed", result.status, result.text);
        state.cErrors = (state.cErrors || 0) + 1;
        if (state.cErrors >= 3) advancePhase = true;
      }
    } else if (phase === "sancionados") {
      const result = await invokeFn("ingest-ceis-cnep", {});
      if (result.ok && result.json) {
        totalRecords += Number(result.json.totalProcessed || 0);
      } else {
        console.error("sancionados tick failed", result.status, result.text);
      }
      advancePhase = true; // single shot
      phaseProgressCurrent = 1; phaseProgressTotal = 1;
    } else if (phase === "auto_analysis") {
      const result = await invokeFn("auto-analysis", {});
      if (result.ok && result.json) {
        totalRecords += Number(result.json.totalAnalyzed || result.json.processed || 0);
      } else {
        console.error("auto-analysis tick failed", result.status, result.text);
      }
      advancePhase = true; // single shot
      phaseProgressCurrent = 1; phaseProgressTotal = 1;
    }
  } catch (err) {
    console.error("tick error", err);
    phaseError = err instanceof Error ? err.message : String(err);
  }

  // Track per-phase timings for smarter ETA on the client
  const phaseTimings: Record<string, { startedAt: string; finishedAt?: string; recordsProcessed: number }> =
    (state.__phaseTimings as any) || {};
  if (!phaseTimings[phase]) {
    phaseTimings[phase] = { startedAt: new Date().toISOString(), recordsProcessed: 0 };
  }
  phaseTimings[phase].recordsProcessed += phaseRecords;

  // Advance phase if needed
  let nextPhase: Phase | null = phase;
  if (advancePhase) {
    phasesCompleted += 1;
    phaseTimings[phase].finishedAt = new Date().toISOString();
    const idx = PHASES.indexOf(phase);
    if (idx + 1 >= PHASES.length) {
      nextPhase = null;
    } else {
      nextPhase = PHASES[idx + 1];
      // Reset phase state but PRESERVE phaseTimings
      Object.keys(state).forEach((k) => {
        if (k !== "__phaseTimings") delete state[k];
      });
      phaseProgressCurrent = 0;
      phaseProgressTotal = 0;
    }
  }

  state.__phaseTimings = phaseTimings;

  // Re-check cancellation BEFORE writing — avoid overwriting a cancel
  const { data: preCheck } = await supabase
    .from("ingestion_jobs").select("status").eq("id", jobId).maybeSingle();
  if (preCheck?.status === "cancelled") {
    return new Response(JSON.stringify({ ok: true, cancelled: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const isDone = nextPhase === null;
  // Update only if status is still running/pending (avoid clobbering a cancel that arrived between reads)
  await supabase.from("ingestion_jobs").update({
    status: isDone ? "completed" : "running",
    current_phase: nextPhase,
    phase_label: nextPhase ? PHASE_LABELS[nextPhase] : "Concluído",
    phases_completed: phasesCompleted,
    phase_progress_current: phaseProgressCurrent,
    phase_progress_total: phaseProgressTotal,
    total_records_processed: totalRecords,
    state,
    last_tick_at: new Date().toISOString(),
    finished_at: isDone ? new Date().toISOString() : null,
    error_message: phaseError,
  }).eq("id", jobId).in("status", ["pending", "running"]);

  // Final cancellation check
  const { data: refreshed } = await supabase
    .from("ingestion_jobs").select("status").eq("id", jobId).maybeSingle();
  if (refreshed?.status === "cancelled") {
    return new Response(JSON.stringify({ ok: true, cancelled: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!isDone) {
    // Self-schedule next tick (fire-and-forget)
    selfSchedule(jobId);
  }

  return new Response(JSON.stringify({ ok: true, phase: nextPhase, isDone, totalRecords }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
