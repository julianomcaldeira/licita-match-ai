import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const API_BASE = "https://api.portaldatransparencia.gov.br/api-de-dados";
const MAX_EXECUTION_MS = 130_000;

function parseBRL(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  return Number(value.replace(/\./g, "").replace(",", ".")) || 0;
}

function inferAutorTipo(value: string | undefined | null): string {
  const n = (value || "").toLowerCase();
  if (!n) return "desconhecido";
  if (n.includes("bancada")) return "bancada";
  if (n.includes("comiss")) return "comissao";
  if (n.includes("relator")) return "relator";
  if (n.includes("individual")) return "individual";
  return "individual";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SYNC_SECRET = Deno.env.get("SYNC_SECRET");
  if (!SYNC_SECRET || req.headers.get("x-sync-secret") !== SYNC_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const apiKey = Deno.env.get("PORTAL_TRANSPARENCIA_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "PORTAL_TRANSPARENCIA_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const startedAt = Date.now();
  const outOfTime = () => Date.now() - startedAt > MAX_EXECUTION_MS - 8000;

  let ano = new Date().getFullYear();
  let replace = false;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body.ano) ano = Number(body.ano);
      if (typeof body.replace === "boolean") replace = body.replace;
    }
  } catch { /* ignore */ }

  const collected: Record<string, any> = {};
  let totalFetched = 0;
  let pages = 0;
  let aborted = false;
  let errorMsg: string | null = null;
  let sampleRow: any = null;
  let sampleKeys: string[] = [];

  try {
    const maxPages = 500;
    for (let page = 1; page <= maxPages; page++) {
      if (outOfTime()) {
        aborted = true;
        console.log(`[emendas] time budget reached at page ${page}`);
        break;
      }

      const url = new URL(`${API_BASE}/emendas`);
      url.searchParams.set("ano", String(ano));
      url.searchParams.set("pagina", String(page));

      let response: Response;
      try {
        response = await fetch(url.toString(), {
          headers: { "chave-api-dados": apiKey, Accept: "application/json" },
          signal: AbortSignal.timeout(15_000),
        });
      } catch (e) {
        console.log(`[emendas] fetch error p${page}:`, e);
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      if (response.status === 429) {
        console.log(`[emendas] rate limited, waiting 10s`);
        await new Promise((r) => setTimeout(r, 10_000));
        continue;
      }
      if (!response.ok) {
        errorMsg = `HTTP ${response.status} on page ${page}`;
        break;
      }

      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0) break;
      if (page === 1 && data[0]) { sampleRow = data[0]; sampleKeys = Object.keys(data[0]); }

      pages = page;
      totalFetched += data.length;

      for (const row of data) {
        const codigo = String(row.codigoEmenda ?? row.numeroEmenda ?? "").trim();
        const autorNome = String(row.autor ?? row.nomeAutor ?? "Não informado").trim();
        if (!codigo) continue;

        const tipoOficial = row.tipoEmenda ?? null;
        const empenhado = parseBRL(row.valorEmpenhado);
        const liquidado = parseBRL(row.valorLiquidado);
        const pago = parseBRL(row.valorPago);
        const restos = parseBRL(row.valorRestoInscrito);
        const restoPago = parseBRL(row.valorRestoPago);
        const restoCancelado = parseBRL(row.valorRestoCancelado);

        const key = `${ano}|${codigo}`;
        const existing = collected[key];
        if (existing) {
          existing.valor_empenhado += empenhado;
          existing.valor_liquidado += liquidado;
          existing.valor_pago += pago;
          existing.valor_restos_pagar += restos;
          existing.valor_resto_pago += restoPago;
          existing.valor_resto_cancelado += restoCancelado;
        } else {
          collected[key] = {
            ano,
            codigo_emenda: codigo,
            numero_emenda: row.numeroEmenda ?? null,
            autor_nome: autorNome,
            autor_tipo: inferAutorTipo(tipoOficial || autorNome),
            tipo_emenda_oficial: tipoOficial,
            autor_uf: null,
            partido: null,
            orgao_codigo: null,
            orgao_nome: null,
            funcao: row.funcao ?? null,
            subfuncao: row.subfuncao ?? null,
            localidade: row.localidadeDoGasto ?? null,
            valor_empenhado: empenhado,
            valor_liquidado: liquidado,
            valor_pago: pago,
            valor_restos_pagar: restos,
            valor_resto_pago: restoPago,
            valor_resto_cancelado: restoCancelado,
          };
        }
      }

      await new Promise((r) => setTimeout(r, 400));
    }

    const rows = Object.values(collected);

    if (replace && !aborted) {
      await supabase.from("emendas_parlamentares").delete().eq("ano", ano);
    }

    let upserted = 0;
    const batchSize = 500;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await supabase
        .from("emendas_parlamentares")
        .upsert(batch, { onConflict: "ano,codigo_emenda" });
      if (error) {
        errorMsg = error.message;
        console.error("[emendas] upsert error:", error);
        break;
      }
      upserted += batch.length;
    }

    await supabase.from("processing_logs").insert({
      etapa: "sync-emendas",
      ano,
      registros_importados: totalFetched,
      registros_consolidados: rows.length,
      detalhes: { pages, aborted, replace, upserted, error: errorMsg, durationMs: Date.now() - startedAt },
    });

    return new Response(
      JSON.stringify({
        success: !errorMsg,
        ano,
        pages,
        totalFetched,
        uniqueRows: rows.length,
        upserted,
        aborted,
        durationMs: Date.now() - startedAt,
        error: errorMsg,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[emendas] fatal:", e);
    await supabase.from("processing_logs").insert({
      etapa: "sync-emendas",
      ano,
      detalhes: { error: String(e), durationMs: Date.now() - startedAt },
    });
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
