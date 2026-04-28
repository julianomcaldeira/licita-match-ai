import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://api.portaldatransparencia.gov.br/api-de-dados";

async function fetchWithRetry(url: string, apiKey: string, retries = 3, delayMs = 2000): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, {
        headers: { Accept: "application/json", "chave-api-dados": apiKey },
      });
      if (resp.status === 429) {
        const wait = delayMs * Math.pow(2, i);
        console.log(`Rate limited, waiting ${wait}ms...`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      return resp;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("Max retries reached");
}

function fmtDateBR(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/**
 * Fetch licitações from Portal da Transparência for a specific orgao (SIAFI code)
 */
async function fetchLicitacoesByOrgao(
  supabase: any,
  apiKey: string,
  codigoOrgao: string,
  dataInicial: string,
  dataFinal: string,
): Promise<{ total: number; errors: string[] }> {
  let pagina = 1;
  let hasMore = true;
  let total = 0;
  const errors: string[] = [];

  while (hasMore) {
    try {
      const url = `${API_BASE}/licitacoes?dataInicial=${encodeURIComponent(dataInicial)}&dataFinal=${encodeURIComponent(dataFinal)}&codigoOrgao=${encodeURIComponent(codigoOrgao)}&pagina=${pagina}`;
      console.log(`Fetching: ${url}`);
      const response = await fetchWithRetry(url, apiKey);

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`HTTP ${response.status}: ${errText.slice(0, 200)}`);
        if (response.status === 404 || response.status === 400) {
          hasMore = false;
          continue;
        }
        errors.push(`Orgao ${codigoOrgao} p${pagina}: HTTP ${response.status}`);
        hasMore = false;
        continue;
      }

      const licitacoes = await response.json();
      if (!Array.isArray(licitacoes) || licitacoes.length === 0) {
        hasMore = false;
        continue;
      }

      const rows = licitacoes.map((l: any) => ({
        id_origem: `pt-lic-${l.id || Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        fonte: "PORTAL_TRANSPARENCIA",
        orgao: l.unidadeGestora?.orgaoVinculado?.nome || l.unidadeGestora?.orgaoMaximo?.nome || "Não informado",
        modalidade: l.modalidadeLicitacao?.descricao || null,
        objeto: l.objeto || "Sem descrição",
        data_publicacao: l.dataAbertura ? l.dataAbertura.split("T")[0] : null,
        valor_estimado: l.valorLicitacao || null,
        situacao: l.situacao || null,
        uf: null,
        municipio: null,
        raw_json: l,
      }));

      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        const { error } = await supabase
          .from("licitacoes")
          .upsert(batch, { onConflict: "id_origem,fonte" });
        if (error) errors.push(`Orgao ${codigoOrgao} p${pagina}: ${error.message}`);
        else total += batch.length;
      }

      hasMore = licitacoes.length >= 500;
      pagina++;
      await new Promise((r) => setTimeout(r, 200));
    } catch (e) {
      errors.push(`Orgao ${codigoOrgao} p${pagina}: ${e instanceof Error ? e.message : "unknown"}`);
      hasMore = false;
    }
  }

  return { total, errors };
}

/**
 * Bulk fetch contracts from Portal da Transparência by date range.
 * Endpoint: /contratos?dataInicial=DD/MM/YYYY&dataFinal=DD/MM/YYYY&pagina=N
 * Each page returns up to 500 records.
 */
async function fetchContratosBulk(
  supabase: any,
  apiKey: string,
  dataInicial: string,
  dataFinal: string,
  maxPages: number = 50,
): Promise<{ total: number; pages: number; errors: string[] }> {
  let pagina = 1;
  let total = 0;
  const errors: string[] = [];
  let hasMore = true;

  while (hasMore && pagina <= maxPages) {
    try {
      const url = `${API_BASE}/contratos?dataInicial=${encodeURIComponent(dataInicial)}&dataFinal=${encodeURIComponent(dataFinal)}&pagina=${pagina}`;
      console.log(`Fetching contratos: ${url}`);
      const response = await fetchWithRetry(url, apiKey);

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`HTTP ${response.status}: ${errText.slice(0, 200)}`);
        if (response.status === 404 || response.status === 400) {
          hasMore = false;
          break;
        }
        errors.push(`Page ${pagina}: HTTP ${response.status}`);
        hasMore = false;
        break;
      }

      const contratos = await response.json();
      if (!Array.isArray(contratos) || contratos.length === 0) {
        hasMore = false;
        break;
      }

      const rows = contratos.map((c: any) => {
        const cnpjOrgao = (c.unidadeGestora?.orgaoVinculado?.cnpj || c.unidadeGestora?.codigo || "desconhecido")
          .toString().replace(/[.\-\/]/g, "");
        const numContrato = c.numero || c.id?.toString() || `pt-c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        return {
          cnpj_orgao: cnpjOrgao,
          numero_contrato: numContrato,
          orgao_nome: c.unidadeGestora?.orgaoVinculado?.nome || c.unidadeGestora?.orgaoMaximo?.nome || null,
          orgao_codigo: c.unidadeGestora?.codigo?.toString() || null,
          fornecedor_nome: c.fornecedor?.nome || null,
          fornecedor_cnpj: c.fornecedor?.cnpjFormatado?.replace(/[.\-\/]/g, "") || c.fornecedor?.cpfFormatado?.replace(/[.\-\/]/g, "") || null,
          objeto: c.objeto || "Sem descrição",
          valor_inicial: c.valorInicialCompra ?? c.valorInicial ?? null,
          valor_final: c.valorFinalCompra ?? c.valorFinal ?? null,
          data_assinatura: c.dataAssinatura || null,
          data_vigencia_inicio: c.dataInicioVigencia || null,
          data_vigencia_fim: c.dataFimVigencia || null,
          data_publicacao: c.dataPublicacaoDOU || c.dataPublicacao || null,
          situacao: c.situacaoCompra || c.situacao || null,
          categoria: c.categoria || null,
          modalidade_compra: c.modalidadeCompra?.descricao || (typeof c.modalidadeCompra === 'string' ? c.modalidadeCompra : null),
          numero_licitacao: c.licitacao?.numero || null,
          raw_json: c,
          fonte: "PORTAL_TRANSPARENCIA",
        };
      });

      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        const { error } = await supabase
          .from("contratos")
          .upsert(batch, { onConflict: "cnpj_orgao,numero_contrato" });
        if (error) errors.push(`Page ${pagina}: ${error.message}`);
        else total += batch.length;
      }

      hasMore = contratos.length >= 500;
      pagina++;
      await new Promise((r) => setTimeout(r, 250));
    } catch (e) {
      errors.push(`Page ${pagina}: ${e instanceof Error ? e.message : "unknown"}`);
      hasMore = false;
    }
  }

  return { total, pages: pagina - 1, errors };
}

/**
 * Fetch contract details by contract number from Portal da Transparência
 */
async function fetchContratoByNumero(
  supabase: any,
  apiKey: string,
  numero: string,
  licitacaoId: string,
  orgaoNome: string,
): Promise<{ found: number; errors: string[] }> {
  const errors: string[] = [];
  let found = 0;

  try {
    const url = `${API_BASE}/contratos/${encodeURIComponent(numero)}`;
    const response = await fetchWithRetry(url, apiKey);

    if (response.status === 404) {
      await response.text();
      return { found: 0, errors: [] };
    }

    if (!response.ok) {
      const errText = await response.text();
      errors.push(`Contract ${numero}: HTTP ${response.status} - ${errText.slice(0, 100)}`);
      return { found, errors };
    }

    const data = await response.json();
    const contratos = Array.isArray(data) ? data : [data];

    for (const c of contratos) {
      const cnpjOrgao = (c.unidadeGestora?.orgaoVinculado?.cnpj || c.unidadeGestora?.codigo || "").replace(/[.\-\/]/g, "");
      const numContrato = c.numero || `pt-c-${c.id || Date.now()}`;

      const { error } = await supabase.from("contratos").upsert({
        cnpj_orgao: cnpjOrgao || "desconhecido",
        numero_contrato: numContrato,
        orgao_nome: c.unidadeGestora?.orgaoVinculado?.nome || orgaoNome,
        orgao_codigo: c.unidadeGestora?.codigo || null,
        fornecedor_nome: c.fornecedor?.nome || null,
        fornecedor_cnpj: c.fornecedor?.cnpjCpf?.replace(/[.\-\/]/g, "") || null,
        objeto: c.objeto || "Sem descrição",
        valor_inicial: c.valorInicial || null,
        valor_final: c.valorFinal || null,
        data_assinatura: c.dataAssinatura || null,
        data_vigencia_inicio: c.dataInicioVigencia || null,
        data_vigencia_fim: c.dataFimVigencia || null,
        data_publicacao: c.dataPublicacao || null,
        situacao: c.situacao || null,
        categoria: c.categoria || null,
        modalidade_compra: c.modalidadeCompra || null,
        licitacao_id: licitacaoId,
        raw_json: c,
        fonte: "PORTAL_TRANSPARENCIA",
      }, { onConflict: "cnpj_orgao,numero_contrato" });

      if (error) errors.push(`Contract upsert: ${error.message}`);
      else found++;
    }
  } catch (e) {
    errors.push(`Contract ${numero}: ${e instanceof Error ? e.message : "unknown"}`);
  }

  return { found, errors };
}

async function authenticateAdmin(req: Request): Promise<{ userId: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "").trim();

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (serviceKey && token === serviceKey) {
    return { userId: "internal-pipeline" };
  }

  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "",
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data, error } = await supabaseAuth.auth.getClaims(token);
  if (error || !data?.claims) return null;

  const userId = data.claims.sub as string;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: roles } = await supabase
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin_central").limit(1);

  if (!roles?.length) return null;
  return { userId };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth + admin check
  const auth = await authenticateAdmin(req);
  if (!auth) {
    return new Response(JSON.stringify({ error: "Não autorizado. Acesso restrito a administradores." }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("PORTAL_TRANSPARENCIA_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ success: false, error: "PORTAL_TRANSPARENCIA_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const body = await req.json().catch(() => ({}));
  const mode = body.mode || "licitacoes";

  try {
    if (mode === "licitacoes") {
      // Fetch federal licitações by orgao code (required param)
      const dataInicial = body.dataInicial;
      const dataFinal = body.dataFinal;
      const codigoOrgao = body.codigoOrgao;

      if (!dataInicial || !dataFinal || !codigoOrgao) {
        return new Response(
          JSON.stringify({ success: false, error: "Required: dataInicial (DD/MM/YYYY), dataFinal (DD/MM/YYYY), codigoOrgao (SIAFI code)" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = await fetchLicitacoesByOrgao(supabase, apiKey, codigoOrgao, dataInicial, dataFinal);

      await supabase.from("ingestao_logs").insert({
        fonte: "PORTAL_TRANSPARENCIA",
        endpoint: `licitacoes/orgao=${codigoOrgao}`,
        status: result.errors.length > 0 ? "parcial" : "sucesso",
        registros_processados: result.total,
        data_inicio: dataInicial,
        data_fim: dataFinal,
        erro: result.errors.length > 0 ? result.errors.join("; ").slice(0, 1000) : null,
      });

      return new Response(
        JSON.stringify({ success: true, totalProcessed: result.total, errors: result.errors.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode === "bulk-contratos") {
      // Bulk fetch contracts by date range (no orgao required)
      const dataInicial = body.dataInicial;
      const dataFinal = body.dataFinal;
      const maxPages = body.maxPages || 50;

      if (!dataInicial || !dataFinal) {
        return new Response(
          JSON.stringify({ success: false, error: "Required: dataInicial (DD/MM/YYYY), dataFinal (DD/MM/YYYY)" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = await fetchContratosBulk(supabase, apiKey, dataInicial, dataFinal, maxPages);

      await supabase.from("ingestao_logs").insert({
        fonte: "PORTAL_TRANSPARENCIA",
        endpoint: `contratos/bulk ${dataInicial}→${dataFinal}`,
        status: result.errors.length > 0 ? "parcial" : "sucesso",
        registros_processados: result.total,
        data_inicio: dataInicial,
        data_fim: dataFinal,
        erro: result.errors.length > 0 ? result.errors.join("; ").slice(0, 1000) : null,
      });

      return new Response(
        JSON.stringify({ success: true, totalProcessed: result.total, pages: result.pages, errors: result.errors.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode === "contratos") {
      // Fetch contract by number
      const numero = body.numero;
      if (!numero) {
        return new Response(
          JSON.stringify({ success: false, error: "Required: numero (contract number)" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = await fetchContratoByNumero(supabase, apiKey, numero, body.licitacaoId || null, body.orgaoNome || "");

      return new Response(
        JSON.stringify({ success: true, contractsFound: result.found, errors: result.errors.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode === "test") {
      // Quick test to verify API key works
      const url = `${API_BASE}/licitacoes/modalidades`;
      console.log(`Testing API key with: ${url}`);
      const response = await fetchWithRetry(url, apiKey);
      const data = await response.json();

      return new Response(
        JSON.stringify({ success: response.ok, status: response.status, modalidades: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid mode. Use: licitacoes, contratos, bulk-contratos, or test" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Erro interno na ingestão. Tente novamente." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
