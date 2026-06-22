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

type AuthOk = {
  supabase: ReturnType<typeof createClient>;
  apiKeyId: string;
  clientName: string;
  empresaClienteId: string | null;
  empresaNome: string | null;
};

async function authenticate(req: Request): Promise<{ error: Response } | AuthOk> {
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
  const { data, error: e } = await supabase.rpc("api_key_resolve_cliente", { p_hash: apiKeyHash });
  if (e || !data || data.length === 0) return { error: err("Invalid API key.", 401) };

  const rec = data[0] as { api_key_id: string; client_name: string; is_active: boolean; empresa_cliente_id: string | null; empresa_nome: string | null };
  if (!rec.is_active) return { error: err("API key is deactivated.", 403) };

  supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", rec.api_key_id).then();

  return {
    supabase,
    apiKeyId: rec.api_key_id,
    clientName: rec.client_name,
    empresaClienteId: rec.empresa_cliente_id,
    empresaNome: rec.empresa_nome,
  };
}

function parseParams(url: URL) {
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 500);
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const search = url.searchParams.get("search") || null;
  const uf = url.searchParams.get("uf") || null;
  return { limit, offset, search, uf };
}

function scopeMeta(auth: AuthOk) {
  return auth.empresaClienteId
    ? { cliente_id: auth.empresaClienteId, cliente_nome: auth.empresaNome }
    : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return err("Only GET requests are supported.", 405);

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/public-api\/?/, "").replace(/\/$/, "");

  if (!path || path === "") {
    return json({
      name: "i-pesquisei Public API",
      version: "1.1",
      endpoints: {
        "/me": "Dados do cliente vinculado à api_key",
        "/me/resumo": "KPIs consolidados do recorte do cliente",
        "/me/vitorias": "Licitações vencidas e contratos firmados (somente por CNPJ)",
        "/licitacoes": "Licitações (recorte do cliente quando a chave for vinculada)",
        "/licitacoes/:id": "Detalhe de licitação",
        "/contratos": "Contratos (recorte do cliente quando a chave for vinculada)",
        "/orgaos": "Órgãos públicos (global)",
        "/empresas-vencedoras": "Empresas vencedoras (global)",
        "/sancionadas": "Empresas sancionadas (global)",
        "/check-sancionada/:cnpj": "Checagem rápida de CNPJ sancionado",
      },
      auth: "x-api-key header ou Authorization: Bearer <key>",
      scope_note: "Chaves vinculadas a um cliente entregam apenas o recorte daquele cliente em /licitacoes, /contratos e /me/*",
    });
  }

  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;
  const { supabase, empresaClienteId } = auth;
  const scope = scopeMeta(auth);

  try {
    // ---------- /me ----------
    if (path === "me") {
      if (!empresaClienteId) return json({ data: null, meta: { scope: null, note: "API key global (sem cliente vinculado)" } });
      const { data: emp } = await supabase
        .from("empresas_clientes")
        .select("id, nome, cnpj, segmentos, palavras_chave, descricao_atividade")
        .eq("id", empresaClienteId)
        .maybeSingle();
      const { data: cnpjs } = await supabase
        .from("cliente_cnpjs")
        .select("cnpj, rotulo")
        .eq("empresa_id", empresaClienteId);
      return json({ data: { ...emp, cnpjs: cnpjs || [] }, meta: { scope } });
    }

    if (path === "me/resumo") {
      if (!empresaClienteId) return err("Esta API key não está vinculada a um cliente.", 400);
      const { data, error: e } = await supabase.rpc("cliente_resumo", { p_empresa_id: empresaClienteId });
      if (e) throw e;
      return json({ data, meta: { scope } });
    }

    if (path === "me/vitorias") {
      if (!empresaClienteId) return err("Esta API key não está vinculada a um cliente.", 400);
      const { limit, offset } = parseParams(url);
      const { data, error: e } = await supabase
        .from("cliente_vinculos")
        .select("tipo, referencia_id, licitacao_id, cnpj_match, data_evento, valor", { count: "exact" })
        .eq("empresa_id", empresaClienteId)
        .order("data_evento", { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1);
      if (e) throw e;
      return json({ data, meta: { scope, limit, offset } });
    }

    // ---------- LICITAÇÕES ----------
    if (path === "licitacoes") {
      const { limit, offset, search, uf } = parseParams(url);
      const modalidade = url.searchParams.get("modalidade") || null;
      const dateFrom = url.searchParams.get("date_from") || null;
      const dateTo = url.searchParams.get("date_to") || null;
      const onlyVencidas = url.searchParams.get("only_vencidas") === "true";

      if (empresaClienteId) {
        const { data, error: e } = await supabase.rpc("list_cliente_licitacoes", {
          p_empresa_id: empresaClienteId,
          p_search: search, p_uf: uf, p_modalidade: modalidade,
          p_date_from: dateFrom, p_date_to: dateTo,
          p_only_vencidas: onlyVencidas,
          p_limit: limit, p_offset: offset,
        });
        if (e) throw e;
        return json({ data, meta: { scope, limit, offset, total: data?.[0]?.total_count ?? 0 } });
      }

      const comVencedor = url.searchParams.get("com_vencedor") === "true";
      const { data, error: e } = await supabase.rpc("search_licitacoes", {
        p_search: search, p_uf: uf, p_modalidade: modalidade,
        p_date_from: dateFrom, p_date_to: dateTo,
        p_com_vencedor: comVencedor,
        p_limit: limit, p_offset: offset,
      });
      if (e) throw e;
      return json({ data, meta: { scope, limit, offset, total: data?.[0]?.total_count ?? 0 } });
    }

    // ---------- LICITAÇÃO DETALHE ----------
    const licMatch = path.match(/^licitacoes\/([0-9a-f-]{36})$/);
    if (licMatch) {
      const id = licMatch[1];
      if (empresaClienteId) {
        // Garante que está no recorte do cliente: vitória OU keyword
        const { data: vit } = await supabase
          .from("cliente_vinculos")
          .select("id")
          .eq("empresa_id", empresaClienteId)
          .eq("tipo", "licitacao_vencedor")
          .eq("licitacao_id", id)
          .maybeSingle();
        if (!vit) {
          const { data: rows } = await supabase.rpc("list_cliente_licitacoes", {
            p_empresa_id: empresaClienteId, p_limit: 1, p_offset: 0,
          });
          const inScope = (rows || []).some((r: any) => r.id === id);
          if (!inScope) {
            const { data: kw } = await supabase
              .from("licitacoes")
              .select("id")
              .eq("id", id)
              .maybeSingle();
            // fallback simple: deny if not found in vínculos
            if (!kw) return err("Licitação not found.", 404);
            // For scoped keys, hide licitações fora do recorte
            return err("Licitação fora do recorte deste cliente.", 404);
          }
        }
      }

      const { data: lic, error: e1 } = await supabase
        .from("licitacoes").select("*").eq("id", id).maybeSingle();
      if (e1) throw e1;
      if (!lic) return err("Licitação not found.", 404);

      const { data: itens } = await supabase
        .from("licitacao_itens")
        .select("*, licitacao_vencedores(*)")
        .eq("licitacao_id", id)
        .order("numero_item");

      const { raw_json, ...licClean } = lic;
      return json({ data: { ...licClean, itens: itens || [] }, meta: { scope } });
    }

    // ---------- CONTRATOS ----------
    if (path === "contratos") {
      const { limit, offset, search, uf } = parseParams(url);
      const fornecedorCnpj = url.searchParams.get("fornecedor_cnpj") || null;
      const dateFrom = url.searchParams.get("date_from") || null;
      const dateTo = url.searchParams.get("date_to") || null;
      const onlyProprios = url.searchParams.get("only_proprios") === "true";

      if (empresaClienteId) {
        const { data, error: e } = await supabase.rpc("list_cliente_contratos", {
          p_empresa_id: empresaClienteId,
          p_search: search, p_uf: uf,
          p_date_from: dateFrom, p_date_to: dateTo,
          p_only_proprios: onlyProprios,
          p_limit: limit, p_offset: offset,
        });
        if (e) throw e;
        return json({ data, meta: { scope, limit, offset, total: data?.[0]?.total_count ?? 0 } });
      }

      let q = supabase.from("contratos")
        .select("id, cnpj_orgao, orgao_nome, numero_contrato, objeto, fornecedor_nome, fornecedor_cnpj, valor_inicial, valor_final, data_assinatura, data_vigencia_inicio, data_vigencia_fim, situacao, modalidade_compra", { count: "exact" })
        .order("data_assinatura", { ascending: false })
        .range(offset, offset + limit - 1);
      if (search) q = q.ilike("objeto", `%${search}%`);
      if (fornecedorCnpj) q = q.ilike("fornecedor_cnpj", `%${fornecedorCnpj}%`);
      const { data, count, error: e } = await q;
      if (e) throw e;
      return json({ data, meta: { scope, limit, offset, total: count ?? 0 } });
    }

    // ---------- ÓRGÃOS (global) ----------
    if (path === "orgaos") {
      const { limit, offset, search, uf } = parseParams(url);
      const orderBy = url.searchParams.get("order_by") || "total_licitacoes";
      const { data, error: e } = await supabase.rpc("list_orgaos", {
        p_search: search, p_uf: uf, p_order_by: orderBy, p_limit: limit, p_offset: offset,
      });
      if (e) throw e;
      return json({ data, meta: { scope, limit, offset, total: data?.[0]?.total_count ?? 0 } });
    }

    if (path === "empresas-vencedoras") {
      const { limit, offset, search, uf } = parseParams(url);
      const orderBy = url.searchParams.get("order_by") || "total_vitorias";
      const { data, error: e } = await supabase.rpc("list_empresas_vencedoras", {
        p_search: search, p_uf: uf, p_order_by: orderBy, p_limit: limit, p_offset: offset,
      });
      if (e) throw e;
      return json({ data, meta: { scope, limit, offset, total: data?.[0]?.total_count ?? 0 } });
    }

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
      return json({ data, meta: { scope, limit, offset, total: count ?? 0 } });
    }

    const checkMatch = path.match(/^check-sancionada\/(\d{11,14})$/);
    if (checkMatch) {
      const cnpj = checkMatch[1];
      const { data } = await supabase
        .from("empresas_sancionadas")
        .select("nome, tipo_cadastro, tipo_sancao, data_inicio, data_fim, orgao_sancionador")
        .ilike("cnpj_cpf", `%${cnpj}%`);
      const records = data || [];
      const vigentes = records.filter((r: any) => !r.data_fim || new Date(r.data_fim) >= new Date());
      return json({ cnpj, sancionada: vigentes.length > 0, total_registros: records.length, vigentes: vigentes.length, registros: records });
    }

    return err(`Unknown endpoint: /${path}. Check /public-api for available endpoints.`, 404);
  } catch (e: any) {
    console.error("API error:", path, e?.message, e?.code, e?.details, e?.hint, e?.stack);
    return err(`Internal server error: ${e?.message || "unknown"}${e?.code ? ` [${e.code}]` : ""}${e?.hint ? ` hint: ${e.hint}` : ""}`, 500);
  }
});
