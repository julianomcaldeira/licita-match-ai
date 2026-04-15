import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const API_BASE = "https://queridodiario.ok.org.br/api";

// Default keywords relevant to licitações
const DEFAULT_KEYWORDS = [
  "licitação",
  "pregão",
  "concorrência",
  "dispensa",
  "inexigibilidade",
  "edital",
  "tomada de preço",
];

async function fetchGazettes(
  supabase: any,
  querystring: string,
  territoryIds: string[] | null,
  dateFrom: string | null,
  dateTo: string | null,
): Promise<{ total: number; errors: string[] }> {
  let offset = 0;
  const size = 100;
  let total = 0;
  const errors: string[] = [];

  while (true) {
    try {
      const params = new URLSearchParams({
        querystring,
        excerpt_size: "500",
        number_of_excerpts: "1",
        size: String(size),
        offset: String(offset),
        sort_by: "descending_date",
      });
      if (territoryIds?.length) {
        for (const tid of territoryIds) {
          params.append("territory_ids", tid);
        }
      }
      if (dateFrom) params.set("published_since", dateFrom);
      if (dateTo) params.set("published_until", dateTo);

      const url = `${API_BASE}/gazettes?${params.toString()}`;
      console.log(`Fetching Querido Diário: offset=${offset}, query="${querystring}"`);

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      const resp = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);

      if (!resp.ok) {
        const txt = await resp.text();
        errors.push(`HTTP ${resp.status}: ${txt.slice(0, 200)}`);
        break;
      }

      const data = await resp.json();
      const gazettes = data.gazettes || [];
      if (gazettes.length === 0) break;

      const rows = gazettes.map((g: any) => ({
        territory_id: g.territory_id,
        territory_name: g.territory_name || null,
        state_code: g.state_code || null,
        publication_date: g.date,
        url: g.url || null,
        excerpt: g.excerpts?.[0] || null,
        query_matched: querystring,
        is_extra_edition: g.is_extra_edition || false,
        txt_url: g.txt_url || null,
        fonte: "QUERIDO_DIARIO",
        raw_json: g,
      }));

      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { error } = await supabase
          .from("diarios_oficiais")
          .upsert(batch, { onConflict: "territory_id,publication_date,url", ignoreDuplicates: true });
        if (error) errors.push(`offset ${offset}: ${error.message}`);
        else total += batch.length;
      }

      const totalAvailable = data.total_gazettes || 0;
      offset += size;
      if (offset >= totalAvailable || gazettes.length < size) break;

      // Rate limit - be gentle with the free API
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      errors.push(`offset ${offset}: ${e instanceof Error ? e.message : "unknown"}`);
      break;
    }
  }

  return { total, errors };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({}));

  // Parameters
  const keywords: string[] = body.keywords || DEFAULT_KEYWORDS;
  const territoryIds: string[] | null = body.territory_ids || null;
  const dateFrom: string | null = body.date_from || null; // YYYY-MM-DD
  const dateTo: string | null = body.date_to || null;
  const singleQuery: string | null = body.query || null;

  try {
    const queries = singleQuery ? [singleQuery] : keywords;
    let grandTotal = 0;
    const allErrors: string[] = [];
    const breakdown: Record<string, number> = {};

    for (const q of queries) {
      const result = await fetchGazettes(supabase, q, territoryIds, dateFrom, dateTo);
      grandTotal += result.total;
      breakdown[q] = result.total;
      allErrors.push(...result.errors);

      // Gentle delay between different keyword searches
      if (queries.length > 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    await supabase.from("ingestao_logs").insert({
      fonte: "QUERIDO_DIARIO",
      endpoint: `gazettes/${singleQuery || "keywords-" + keywords.length}`,
      status: allErrors.length > 0 ? "parcial" : "sucesso",
      registros_processados: grandTotal,
      data_inicio: dateFrom,
      data_fim: dateTo,
      erro: allErrors.length > 0 ? allErrors.join("; ").slice(0, 1000) : null,
    });

    return new Response(
      JSON.stringify({ success: true, totalProcessed: grandTotal, breakdown, errors: allErrors.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno na ingestão do Querido Diário" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
