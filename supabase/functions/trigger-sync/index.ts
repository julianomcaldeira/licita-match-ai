import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_TARGETS = new Set([
  "sync-transparencia",
  "sync-pagamentos-diarios",
  "comprasgov-collector",
  "sync-contratos-gov",
  "compute-analytics",
  "import-csv-transparencia",
  "sync-emendas",
  "enrich-emendas-orgaos",
]);


function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // 1. Require a valid Supabase JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return jsonResponse({ error: "Invalid token" }, 401);
  }
  const userId = claimsData.claims.sub as string;

  // 2. Require admin_central role
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: isAdmin, error: roleErr } = await adminClient.rpc("iverbas_has_role", {
    _user_id: userId,
    _role: "admin_central",
  });
  if (roleErr || !isAdmin) {
    return jsonResponse({ error: "Forbidden: admin_central role required" }, 403);
  }

  const syncSecret = Deno.env.get("SYNC_SECRET");
  if (!syncSecret) {
    return jsonResponse({ error: "SYNC_SECRET not configured" }, 500);
  }

  // 3. Resolve target — either query-string (passthrough mode) or JSON body
  const url = new URL(req.url);
  const targetQS = url.searchParams.get("target");
  let target = targetQS || "";
  let jsonPayload: Record<string, unknown> | null = null;
  let passthroughBody: BodyInit | null = null;
  let passthroughContentType: string | null = null;

  const contentType = req.headers.get("content-type") || "";

  if (targetQS) {
    // Passthrough: forward the raw request body (e.g. multipart file uploads)
    passthroughBody = await req.arrayBuffer();
    passthroughContentType = contentType || null;
  } else {
    let body: { target?: string; payload?: Record<string, unknown> } = {};
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }
    target = String(body.target || "").trim();
    jsonPayload = body.payload ?? {};
  }

  if (!ALLOWED_TARGETS.has(target)) {
    return jsonResponse({ error: `Invalid target. Allowed: ${[...ALLOWED_TARGETS].join(", ")}` }, 400);
  }

  const headers: Record<string, string> = {
    "x-sync-secret": syncSecret,
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  };
  let upstreamBody: BodyInit;
  if (passthroughBody !== null) {
    upstreamBody = passthroughBody;
    if (passthroughContentType) headers["Content-Type"] = passthroughContentType;
  } else {
    headers["Content-Type"] = "application/json";
    upstreamBody = JSON.stringify(jsonPayload ?? {});
  }

  const upstream = await fetch(`${supabaseUrl}/functions/v1/${target}`, {
    method: "POST",
    headers,
    body: upstreamBody,
  });

  const text = await upstream.text();
  let data: unknown = text;
  try { data = JSON.parse(text); } catch { /* keep as text */ }

  return new Response(JSON.stringify({ target, status: upstream.status, data }), {
    status: upstream.ok ? 200 : upstream.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
