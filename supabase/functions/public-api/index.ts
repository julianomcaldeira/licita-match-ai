import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return json({ error: message }, status);
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Validate API key and return supabase service client
async function authenticate(req: Request) {
  const apiKey =
    req.headers.get("x-api-key") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!apiKey || apiKey.length < 20) {
    return { error: err("Missing or invalid API key. Provide via x-api-key header or Bearer token.", 401) };
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const apiKeyHash = await sha256Hex(apiKey);

  const { data: keyRecord, error: keyErr } = await supabase
    .from("api_keys")
    .select("id, client_name, is_active")
    .eq("api_key_hash", apiKeyHash)
    .maybeSingle();

  if (keyErr || !keyRecord) {
    return { error: err("Invalid API key.", 401) };
  }
  if (!keyRecord.is_active) {
    return { error: err("API key is deactivated.", 403) };
  }

  // Update last_used_at (fire-and-forget)
  supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRecord.id).then();

  return { supabase, client: keyRecord };
}

function parseParams(url: URL) {
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 500);
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const search = url.searchParams.get("search") || null;
  const uf = url.searchParams.get("uf") || null;
  return { limit, offset, search, uf };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return err("Only GET requests are supported.", 405);
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/public-api\/?/, "").replace(/\/$/, "");

  // Root: API docs
  if (!path || path === "") {
    return json({
      name: "i-pesquisei Public API",
      version: "1.0",
      endpoints: {
        "/licitacoes": "Search biddings with filters (search, uf, modalidade, date_from, date_to, com_vencedor, limit, offset)",
        "/licitacoes/:id": "Get bidding details with items and winners",
        "/orgaos": "List public agencies (search, uf, order_by, limit, offset)",
        "/empresas-vencedoras": "List winning companies (search, uf, order_by, limit, offset)",
        "/sancionadas": "Search sanctioned companies - CEIS/CNEP (search, uf, tipo_cadastro, vigente, limit, offset)",
        "/contratos": "Search contracts (search, uf, fornecedor_cnpj, limit, offset)",
        "/check-sancionada/:cnpj": "Quick check if a CNPJ is sanctioned",
      },
      auth: "Send API key via x-api-key header or Authorization: Bearer <key>",
      limits: "Max 500 records per request",
    });
  }

  const auth = await authenticate(req);
  if (auth.error) return auth.error;
  const { supabase } = auth;

  try {
    // ---- LICITAÇÕES ----
    if (path === "licitacoes") {
      const { limit, offset, search, uf } = parseParams(url);
      const modalidade = url.searchParams.get("modalidade") || null;
      const dateFrom = url.searchParams.get("date_from") || null;
      const dateTo = url.searchParams.get("date_to") || null;
      const comVencedor = url.searchParams.get("com_vencedor") === "true";

      const { data, error: e } = await supabase.rpc("search_licitacoes", {
        p_search: search,
        p_uf: uf,
        p_modalidade: modalidade,
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_com_vencedor: comVencedor,
        p_limit: limit,
        p_offset: offset,
      });
      if (e) throw e;
      return json({ data, meta: { limit, offset, total: data?.[0]?.total_count ?? 0 } });
    }

    // ---- LICITAÇÃO DETALHE ----
    const licMatch = path.match(/^licitacoes\/([0-9a-f-]{36})$/);
    if (licMatch) {
      const id = licMatch[1];
      const { data: lic, error: e1 } = await supabase
        .from("licitacoes")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (e1) throw e1;
      if (!lic) return err("Licitação not found.", 404);

      const { data: itens } = await supabase
        .from("licitacao_itens")
        .select("*, licitacao_vencedores(*)")
        .eq("licitacao_id", id)
        .order("numero_item");

      // Strip raw_json for cleaner response
      const { raw_json, ...licClean } = lic;
      return json({ data: { ...licClean, itens: itens || [] } });
    }

    // ---- ÓRGÃOS ----
    if (path === "orgaos") {
      const { limit, offset, search, uf } = parseParams(url);
      const orderBy = url.searchParams.get("order_by") || "total_licitacoes";

      const { data, error: e } = await supabase.rpc("list_orgaos", {
        p_search: search,
        p_uf: uf,
        p_order_by: orderBy,
        p_limit: limit,
        p_offset: offset,
      });
      if (e) throw e;
      return json({ data, meta: { limit, offset, total: data?.[0]?.total_count ?? 0 } });
    }

    // ---- EMPRESAS VENCEDORAS ----
    if (path === "empresas-vencedoras") {
      const { limit, offset, search, uf } = parseParams(url);
      const orderBy = url.searchParams.get("order_by") || "total_vitorias";

      const { data, error: e } = await supabase.rpc("list_empresas_vencedoras", {
        p_search: search,
        p_uf: uf,
        p_order_by: orderBy,
        p_limit: limit,
        p_offset: offset,
      });
      if (e) throw e;
      return json({ data, meta: { limit, offset, total: data?.[0]?.total_count ?? 0 } });
    }

    // ---- SANCIONADAS ----
    if (path === "sancionadas") {
      const { limit, offset, search, uf } = parseParams(url);
      const tipoCadastro = url.searchParams.get("tipo_cadastro") || null;
      const vigente = url.searchParams.get("vigente");

      let q = supabase.from("empresas_sancionadas")
        .select("id, nome, cnpj_cpf, tipo_cadastro, tipo_sancao, orgao_sancionador, uf_orgao, data_inicio, data_fim, fonte", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (search) {
        const isNumeric = /^\d/.test(search.replace(/\D/g, ""));
        q = isNumeric ? q.ilike("cnpj_cpf", `%${search}%`) : q.ilike("nome", `%${search}%`);
      }
      if (uf) q = q.eq("uf_orgao", uf);
      if (tipoCadastro) q = q.eq("tipo_cadastro", tipoCadastro);
      if (vigente === "true") q = q.or("data_fim.is.null,data_fim.gte." + new Date().toISOString().split("T")[0]);

      const { data, count, error: e } = await q;
      if (e) throw e;
      return json({ data, meta: { limit, offset, total: count ?? 0 } });
    }

    // ---- CHECK SANCIONADA ----
    const checkMatch = path.match(/^check-sancionada\/(\d{11,14})$/);
    if (checkMatch) {
      const cnpj = checkMatch[1];
      const { data } = await supabase
        .from("empresas_sancionadas")
        .select("nome, tipo_cadastro, tipo_sancao, data_inicio, data_fim, orgao_sancionador")
        .ilike("cnpj_cpf", `%${cnpj}%`);

      const records = data || [];
      const vigentes = records.filter(r => !r.data_fim || new Date(r.data_fim) >= new Date());
      return json({ cnpj, sancionada: vigentes.length > 0, total_registros: records.length, vigentes: vigentes.length, registros: records });
    }

    // ---- CONTRATOS ----
    if (path === "contratos") {
      const { limit, offset, search, uf } = parseParams(url);
      const fornecedorCnpj = url.searchParams.get("fornecedor_cnpj") || null;

      let q = supabase.from("contratos")
        .select("id, cnpj_orgao, orgao_nome, numero_contrato, objeto, fornecedor_nome, fornecedor_cnpj, valor_inicial, valor_final, data_assinatura, data_vigencia_inicio, data_vigencia_fim, situacao, modalidade_compra", { count: "exact" })
        .order("data_assinatura", { ascending: false })
        .range(offset, offset + limit - 1);

      if (search) q = q.ilike("objeto", `%${search}%`);
      if (fornecedorCnpj) q = q.ilike("fornecedor_cnpj", `%${fornecedorCnpj}%`);

      const { data, count, error: e } = await q;
      if (e) throw e;
      return json({ data, meta: { limit, offset, total: count ?? 0 } });
    }

    return err(`Unknown endpoint: /${path}. Check /public-api for available endpoints.`, 404);
  } catch (e: any) {
    console.error("API error:", e);
    return err("Internal server error.", 500);
  }
});
