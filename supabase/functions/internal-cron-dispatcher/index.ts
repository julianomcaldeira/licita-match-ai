// Internal dispatcher for pg_cron jobs.
// pg_cron calls this with the project's anon key (verify_jwt=false here).
// This function then re-invokes target functions WITH service_role key,
// which the target functions accept as "internal-pipeline" identity.
// This keeps service_role out of pg_cron job definitions while still
// allowing scheduled internal jobs to bypass the admin-only auth gate.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_TARGETS = new Set([
  "ingest-contratos",
  "ingest-ceis-cnep",
  "ingest-pncp",
  "ingest-pncp-dadosabertos",
  "ingest-querido-diario",
  "calculate-orgao-score",
  "pncp-fill-gaps",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* ignore */
  }

  const target = String(body.target || "");
  const payload = body.payload ?? {};

  if (!ALLOWED_TARGETS.has(target)) {
    return new Response(
      JSON.stringify({
        error: "Invalid target",
        allowed: [...ALLOWED_TARGETS],
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const url = `${supabaseUrl}/functions/v1/${target}`;

  try {
    const fetchPromise = fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify(payload),
    }).catch((e) => {
      console.error(`dispatch ${target} failed:`, e);
      return null;
    });

    // Keep this isolate alive until the target finishes, otherwise the
    // in-flight request is killed as soon as we return a response.
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) {
      rt.waitUntil(fetchPromise);
    }

    // Jobs longos (ex.: drenagem da fila do PNCP) pedem waitMs alto: mantemos
    // a conexão aberta até o alvo terminar, senão o worker é encerrado cedo.
    const waitMs = Math.max(
      1000,
      Math.min(Number(body.waitMs) || 5000, 240_000),
    );

    const result = await Promise.race([
      fetchPromise.then((r) => ({ status: r ? r.status : "failed" })),
      new Promise<{ status: string }>((resolve) =>
        setTimeout(() => resolve({ status: "dispatched" }), waitMs)
      ),
    ]);

    return new Response(
      JSON.stringify({ ok: true, target, payload, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: e instanceof Error ? e.message : "unknown",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
