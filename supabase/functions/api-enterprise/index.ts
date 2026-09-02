import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth validation
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return jsonResponse({ error: "Invalid token" }, 401);
  }

  const userId = claimsData.claims.sub as string;

  // Parse the URL path
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // Edge function path: /api-enterprise/iscores, /api-enterprise/insights, etc.
  const endpoint = pathParts[pathParts.length - 1] || "status";

  const ano = parseInt(url.searchParams.get("ano") || String(new Date().getFullYear()));
  const periodo = url.searchParams.get("periodo") || String(ano);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
  const offset = parseInt(url.searchParams.get("offset") || "0");

  try {
    switch (endpoint) {
      case "iscores": {
        const tipoScore = url.searchParams.get("tipo_score");
        const entidadeTipo = url.searchParams.get("entidade_tipo");
        
        let query = supabase
          .from("iscores")
          .select("*")
          .eq("ano", ano)
          .order("valor", { ascending: false })
          .range(offset, offset + limit - 1);

        if (tipoScore) query = query.eq("tipo_score", tipoScore);
        if (entidadeTipo) query = query.eq("entidade_tipo", entidadeTipo);

        const { data, error } = await query;
        if (error) throw error;
        return jsonResponse({ data, count: data?.length || 0 });
      }

      case "insights": {
        const tipoInsight = url.searchParams.get("tipo_insight");
        const minRelevancia = parseInt(url.searchParams.get("min_relevancia") || "0");

        let query = supabase
          .from("market_insights")
          .select("*")
          .gte("relevancia_score", minRelevancia)
          .order("relevancia_score", { ascending: false })
          .range(offset, offset + limit - 1);

        if (tipoInsight) query = query.eq("tipo_insight", tipoInsight);
        if (periodo) query = query.eq("periodo", periodo);

        const { data, error } = await query;
        if (error) throw error;
        return jsonResponse({ data, count: data?.length || 0 });
      }

      case "benchmark": {
        const segmento = url.searchParams.get("segmento");

        let query = supabase
          .from("sector_benchmark")
          .select("*")
          .eq("ano", ano)
          .order("total_pago", { ascending: false })
          .range(offset, offset + limit - 1);

        if (segmento) query = query.eq("segmento", segmento);

        const { data, error } = await query;
        if (error) throw error;
        return jsonResponse({ data, count: data?.length || 0 });
      }

      case "concentration": {
        const orgao = url.searchParams.get("orgao");

        let query = supabase
          .from("concentration_analysis")
          .select("*")
          .eq("ano", ano)
          .order("hhi_index", { ascending: false })
          .range(offset, offset + limit - 1);

        if (orgao) query = query.ilike("orgao", `%${orgao}%`);

        const { data, error } = await query;
        if (error) throw error;
        return jsonResponse({ data, count: data?.length || 0 });
      }

      case "execution-summary": {
        const { data: report, error } = await supabase
          .from("executive_reports")
          .select("*")
          .eq("ano", ano)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        return jsonResponse({ data: report });
      }

      case "status":
      default:
        return jsonResponse({
          service: "i-Verbas Enterprise API",
          version: "1.0.0",
          endpoints: [
            "GET /iscores?ano=2025&tipo_score=oportunidade&entidade_tipo=orgao",
            "GET /insights?ano=2025&tipo_insight=concentracao_fornecedor&min_relevancia=50",
            "GET /benchmark?ano=2025&segmento=Tecnologia",
            "GET /concentration?ano=2025&orgao=Educação",
            "GET /execution-summary?ano=2025",
          ],
          authenticated_as: userId,
        });
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
