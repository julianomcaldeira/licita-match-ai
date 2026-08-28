import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Public health probe (verify_jwt=false) - read-only, no side effects, uses SERVICE_ROLE internally
// Rate limited via simple in-memory window (edge isolates are ephemeral, but mitigates burst)
const hits = new Map<string, number[]>();
function rateLimited(ip: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = hits.get(ip) || [];
  const recent = arr.filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > limit;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (rateLimited(ip)) {
    return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const [healthRes, rotasRes, gapsRes] = await Promise.all([
      supabase.rpc("ingestao_health_snapshot"),
      supabase.rpc("ingestao_rotas_resumo"),
      supabase.rpc("gap_queue_summary").then((r) => r).catch(() => ({ data: null })),
    ]);

    const health = (healthRes as any).data?.[0] || (healthRes as any).data || null;
    const rotas = (rotasRes as any).data || null;
    const gaps = (gapsRes as any).data?.[0] || (gapsRes as any).data || null;

    return new Response(JSON.stringify({ ok: true, health, rotas, gaps, ts: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
