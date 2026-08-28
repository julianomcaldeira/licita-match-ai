// Internal dispatcher for pg_cron jobs.
// Hardened: requires service_role or admin_central JWT. pg_cron now stores only anon for public health, but dispatcher validates caller.
// pg_cron jobs that need service_role must be created with service_role key (not anon) OR via authenticated admin.
// This keeps service_role out of job definitions when possible, but blocks anonymous abuse (limit 3000, parallel 40).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function requireServiceOrAdmin(req: Request): Promise<{ ok: true } | { ok: false; status: number; msg: string }> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, status: 401, msg: "missing_token" };
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (serviceKey && token === serviceKey) return { ok: true };
  // Check admin_central via anon+JWT
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "", {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: claims } = await supabase.auth.getClaims(token);
    const uid = (claims as any)?.claims?.sub;
    if (!uid) return { ok: false, status: 401, msg: "invalid_token" };
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin_central").limit(1);
    if (roles?.length) return { ok: true };
  } catch (_) { /* fallthrough */ }
  return { ok: false, status: 403, msg: "forbidden_admin_only" };
}

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

  // Health probe is public (read-only, no side effects) via anon; all other dispatches require service_role/admin
  const isHealthProbe = String(body.target || "") === "pncp-fill-gaps" && String(body.payload?.mode || "") === "health";
  if (!isHealthProbe) {
    const authRes = await requireServiceOrAdmin(req);
    if (!authRes.ok) {
      return new Response(JSON.stringify({ error: authRes.msg }), {
        status: authRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
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
      fetchPromise.then(async (r) => {
        if (!r) return { status: "failed" };
        if (body.returnBody) {
          const text = await r.text().catch(() => "");
          return { status: r.status, body: text.slice(0, 4000) };
        }
        return { status: r.status };
      }),
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
