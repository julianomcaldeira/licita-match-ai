import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const API_BASE = "https://api.portaldatransparencia.gov.br/api-de-dados";
const MAX_EXECUTION_MS = 130_000;
const REQ_DELAY_MS = 350;

function parseBRL(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  return Number(value.replace(/\./g, "").replace(",", ".")) || 0;
}

async function apiGet(url: string, apiKey: string): Promise<{ status: number; data: any }> {
  const r = await fetch(url, {
    headers: { "chave-api-dados": apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (r.status === 429) {
    await new Promise((res) => setTimeout(res, 10_000));
    return apiGet(url, apiKey);
  }
  let data: any = null;
  try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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
    return new Response(JSON.stringify({ error: "PORTAL_TRANSPARENCIA_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const startedAt = Date.now();
  const outOfTime = () => Date.now() - startedAt > MAX_EXECUTION_MS - 8000;

  let ano = new Date().getFullYear();
  let listLimit = 60;       // how many emendas to fetch the doc-list for
  let detailLimit = 250;    // how many emendas_documentos rows to enrich with /despesas/documentos
  let force = false;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body.ano) ano = Number(body.ano);
      if (body.listLimit) listLimit = Math.min(500, Math.max(0, Number(body.listLimit)));
      if (body.detailLimit) detailLimit = Math.min(2000, Math.max(0, Number(body.detailLimit)));
      if (typeof body.force === "boolean") force = body.force;
    }
  } catch { /* ignore */ }

  let listProcessed = 0;
  let docsInserted = 0;
  let detailsUpdated = 0;
  let errors = 0;

  // ============================================================
  // STEP A — fetch document list per emenda
  // ============================================================
  if (listLimit > 0) {
    let q = supabase
      .from("emendas_parlamentares")
      .select("id, codigo_emenda")
      .eq("ano", ano)
      .order("valor_empenhado", { ascending: false })
      .limit(listLimit);
    if (!force) q = q.is("docs_enriched_at", null);
    const { data: emendas, error } = await q;
    if (error) console.error("[enrich:list] select error:", error);

    for (const em of emendas || []) {
      if (outOfTime()) break;
      const codigo = em.codigo_emenda;
      const allDocs: Array<{ documento_id: string; fase: string | null }> = [];

      for (let page = 1; page <= 50; page++) {
        if (outOfTime()) break;
        const url = `${API_BASE}/emendas/documentos/${encodeURIComponent(codigo)}?pagina=${page}`;
        const { status, data } = await apiGet(url, apiKey);
        if (status === 404) break;
        if (status !== 200 || !Array.isArray(data)) { if (status !== 404) errors++; break; }
        if (data.length === 0) break;
        for (const d of data) {
          const docId = String(d.codigoDocumento ?? d.documento ?? d.id ?? "").trim();
          if (!docId) continue;
          allDocs.push({ documento_id: docId, fase: d.fase ?? null });
        }
        if (data.length < 15) break;
        await new Promise((r) => setTimeout(r, REQ_DELAY_MS));
      }

      if (allDocs.length > 0) {
        const rows = allDocs.map((d) => ({
          ano,
          codigo_emenda: codigo,
          documento_id: d.documento_id,
          fase: d.fase,
        }));
        const { error: upErr } = await supabase
          .from("emendas_documentos")
          .upsert(rows, { onConflict: "ano,codigo_emenda,documento_id", ignoreDuplicates: true });
        if (upErr) { console.error("[enrich:list] upsert:", upErr); errors++; }
        else docsInserted += rows.length;
      }

      await supabase
        .from("emendas_parlamentares")
        .update({ docs_enriched_at: new Date().toISOString(), docs_count: allDocs.length })
        .eq("id", em.id);
      listProcessed++;
    }
  }

  // ============================================================
  // STEP B — enrich each emendas_documentos row with /despesas/documentos
  // ============================================================
  if (detailLimit > 0 && !outOfTime()) {
    let q = supabase
      .from("emendas_documentos")
      .select("id, documento_id, codigo_emenda")
      .eq("ano", ano)
      .is("orgao_codigo", null)
      .limit(detailLimit);
    const { data: pendingDocs, error } = await q;
    if (error) console.error("[enrich:detail] select error:", error);

    let sampleLogged = false;
    for (const doc of pendingDocs || []) {
      if (outOfTime()) break;
      const url = `${API_BASE}/despesas/documentos/${encodeURIComponent(doc.documento_id)}`;
      const { status, data } = await apiGet(url, apiKey);
      if (status !== 200 || !data) {
        if (status !== 404) errors++;
        // Mark as processed with empty to avoid endless retries: use a sentinel
        await supabase.from("emendas_documentos")
          .update({ orgao_codigo: "NAO_DISPONIVEL", orgao_nome: "Não disponível na API" })
          .eq("id", doc.id);
        await new Promise((r) => setTimeout(r, REQ_DELAY_MS));
        continue;
      }
      const item = Array.isArray(data) ? data[0] : data;
      if (!sampleLogged) { console.log("[detail] sample:", JSON.stringify(item).slice(0, 600)); sampleLogged = true; }

      const valor = parseBRL(item.valor);
      const faseStr = (item.fase ?? "").toLowerCase();
      let valorEmp = 0, valorLiq = 0, valorPag = 0;
      if (faseStr.includes("empenho")) valorEmp = valor;
      else if (faseStr.includes("liquid")) valorLiq = valor;
      else if (faseStr.includes("pag")) valorPag = valor;

      const update = {
        orgao_codigo: String(item.codigoOrgao ?? "").trim() || "NAO_DISPONIVEL",
        orgao_nome: String(item.orgao ?? "Não disponível na API"),
        orgao_superior_codigo: String(item.codigoOrgaoSuperior ?? "").trim() || null,
        orgao_superior_nome: item.orgaoSuperior ?? null,
        unidade_gestora_codigo: String(item.codigoUg ?? "").trim() || null,
        unidade_gestora_nome: item.ug ?? null,
        fase: item.fase ?? null,
        valor_documento: valor,
        valor_empenhado: valorEmp,
        valor_liquidado: valorLiq,
        valor_pago: valorPag,
      };
      const { error: updErr } = await supabase
        .from("emendas_documentos").update(update).eq("id", doc.id);
      if (updErr) { console.error("[enrich:detail] update:", updErr); errors++; }
      else detailsUpdated++;

      await new Promise((r) => setTimeout(r, REQ_DELAY_MS));
    }
  }

  // Pending counts
  const { count: pendingEmendas } = await supabase
    .from("emendas_parlamentares").select("id", { count: "exact", head: true })
    .eq("ano", ano).is("docs_enriched_at", null);
  const { count: pendingDetails } = await supabase
    .from("emendas_documentos").select("id", { count: "exact", head: true })
    .eq("ano", ano).is("orgao_codigo", null);

  return new Response(JSON.stringify({
    success: true, ano,
    listProcessed, docsInserted, detailsUpdated, errors,
    pendingEmendas, pendingDetails,
    durationMs: Date.now() - startedAt,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
