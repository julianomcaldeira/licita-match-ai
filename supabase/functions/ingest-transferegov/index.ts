import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const API_BASE = "http://api-publica.transferegov.gestao.gov.br";
// Endpoints estáveis em 27/08/2026: /especiais e /parcerias (Gestão de Parcerias)
// Fundo a Fundo e TED entram até fim de 2026 - já provisionados com fallback 404
const ENDPOINTS: Record<string, string> = {
  especiais: `${API_BASE}/especiais`,
  convenios: `${API_BASE}/parcerias/instrumentos`, // Gestão de Parcerias - instrumentos
  fundoafundo: `${API_BASE}/fundoafundo`,
};

async function fetchWithRetry(url: string, retries = 3, delayMs = 1500): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const resp = await fetch(url, { headers: { Accept: "application/json" }, signal: ctrl.signal });
      clearTimeout(t);
      if (resp.status === 429) {
        const wait = delayMs * Math.pow(2, i);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      return resp;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("Max retries");
}

function toDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = String(s).split("T")[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

async function ingestEspeciais(supabase: any, opts: { pagina?: number; tamanho?: number; uf?: string }): Promise<{ total: number; hasMore: boolean; errors: string[] }> {
  const pagina = opts.pagina ?? 1;
  const tamanho = Math.min(opts.tamanho ?? 100, 500);
  let url = `${ENDPOINTS.especiais}?pagina=${pagina}&tamanhoPagina=${tamanho}`;
  if (opts.uf) url += `&uf=${encodeURIComponent(opts.uf)}`;

  const resp = await fetchWithRetry(url);
  if (resp.status === 404) return { total: 0, hasMore: false, errors: [] };
  if (!resp.ok) {
    const txt = await resp.text();
    return { total: 0, hasMore: false, errors: [`especiais p${pagina}: HTTP ${resp.status} ${txt.slice(0, 120)}`] };
  }
  const data: any = await resp.json();
  const list: any[] = Array.isArray(data) ? data : data.data || data.conteudo || data.resultados || [];
  if (list.length === 0) return { total: 0, hasMore: false, errors: [] };

  const rows = list.map((r: any) => {
    const id = r.id ?? r.idTransferenciaEspecial ?? r.numeroTransferenciaEspecial ?? r.codigo ?? `${r.ano ?? ""}-${r.municipio ?? ""}-${Math.random().toString(36).slice(2, 6)}`;
    return {
      id_origem: String(id),
      ente_nome: r.enteNome ?? r.nomeEnte ?? r.municipio ?? null,
      ente_uf: r.uf ?? r.siglaUf ?? r.enteUf ?? null,
      ente_municipio: r.municipio ?? r.nomeMunicipio ?? r.enteMunicipio ?? null,
      ente_cnpj: r.cnpjEnte ?? r.cnpj ?? null,
      valor: r.valor ?? r.valorTransferencia ?? r.valorEmpenhado ?? null,
      ano: r.ano ?? r.anoTransferencia ?? (r.dataTransferencia ? Number(String(r.dataTransferencia).slice(0, 4)) : null),
      situacao: r.situacao ?? r.status ?? null,
      objeto: r.objeto ?? r.descricao ?? null,
      parlamentar_nome: r.parlamentarNome ?? r.nomeParlamentar ?? null,
      data_transferencia: toDate(r.dataTransferencia ?? r.data ?? null),
      raw_json: r,
    };
  });

  let inserted = 0;
  const errors: string[] = [];
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error, count } = await supabase.from("transferegov_especiais").upsert(batch, { onConflict: "id_origem", ignoreDuplicates: false, count: "exact" });
    if (error) errors.push(`especiais upsert p${pagina}: ${error.message}`);
    else inserted += count ?? batch.length;
  }

  const hasMore = list.length >= tamanho;
  return { total: inserted, hasMore, errors };
}

async function ingestConvenios(supabase: any, opts: { pagina?: number; tamanho?: number; uf?: string }): Promise<{ total: number; hasMore: boolean; errors: string[] }> {
  const pagina = opts.pagina ?? 1;
  const tamanho = Math.min(opts.tamanho ?? 100, 500);
  let url = `${ENDPOINTS.convenios}?pagina=${pagina}&tamanhoPagina=${tamanho}`;
  if (opts.uf) url += `&uf=${encodeURIComponent(opts.uf)}`;

  const resp = await fetchWithRetry(url);
  if (resp.status === 404) return { total: 0, hasMore: false, errors: [] };
  if (!resp.ok) {
    const txt = await resp.text();
    return { total: 0, hasMore: false, errors: [`convenios p${pagina}: HTTP ${resp.status} ${txt.slice(0, 120)}`] };
  }
  const data: any = await resp.json();
  const list: any[] = Array.isArray(data) ? data : data.data || data.conteudo || data.resultados || [];
  if (list.length === 0) return { total: 0, hasMore: false, errors: [] };

  const rows = list.map((r: any) => {
    const id = r.idInstrumento ?? r.id ?? r.numeroConvenio ?? r.numero ?? `${r.ano ?? ""}-${Math.random().toString(36).slice(2, 6)}`;
    return {
      id_origem: String(id),
      numero_convenio: r.numeroConvenio ?? r.numero ?? null,
      concedente_nome: r.concedenteNome ?? r.orgaoConcedente ?? null,
      convenente_nome: r.convenenteNome ?? r.enteNome ?? r.municipio ?? null,
      convenente_uf: r.uf ?? r.siglaUf ?? r.convenenteUf ?? null,
      convenente_municipio: r.municipio ?? r.nomeMunicipio ?? null,
      convenente_cnpj: r.cnpjConvenente ?? r.cnpj ?? null,
      objeto: r.objeto ?? r.descricaoObjeto ?? null,
      valor_global: r.valorGlobal ?? r.valor ?? null,
      valor_repasse: r.valorRepasse ?? null,
      valor_contrapartida: r.valorContrapartida ?? null,
      situacao: r.situacao ?? r.status ?? null,
      data_assinatura: toDate(r.dataAssinatura ?? null),
      data_fim_vigencia: toDate(r.dataFimVigencia ?? null),
      raw_json: r,
    };
  });

  let inserted = 0;
  const errors: string[] = [];
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error, count } = await supabase.from("transferegov_convenios").upsert(batch, { onConflict: "id_origem", ignoreDuplicates: false, count: "exact" });
    if (error) errors.push(`convenios upsert p${pagina}: ${error.message}`);
    else inserted += count ?? batch.length;
  }

  return { total: inserted, hasMore: list.length >= tamanho, errors };
}

async function authenticateAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (serviceKey && token === serviceKey) return true;
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "", {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data } = await supabase.auth.getClaims(token);
    const uid = (data as any)?.claims?.sub;
    if (!uid) return false;
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin_central").limit(1);
    return !!roles?.length;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!(await authenticateAdmin(req))) {
    return new Response(JSON.stringify({ error: "Não autorizado - admin_central ou service_role" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));
  const mode = String(body.mode || "especiais"); // especiais | convenios | fundoafundo | all
  const pagina = Number(body.pagina || 1);
  const tamanho = Number(body.tamanho || 100);
  const uf = body.uf ? String(body.uf) : undefined;

  try {
    if (mode === "all") {
      const [e, c] = await Promise.all([ingestEspeciais(supabase, { pagina, tamanho, uf }), ingestConvenios(supabase, { pagina, tamanho, uf })]);
      const total = e.total + c.total;
      const hasMore = e.hasMore || c.hasMore;
      const errors = [...e.errors, ...c.errors];
      await supabase.from("ingestao_logs").insert({ fonte: "TRANSFEREGOV", endpoint: `all p${pagina} uf=${uf || "todas"}`, registros_processados: total, status: errors.length ? "parcial" : "sucesso", erro: errors.join("; ").slice(0, 1000) || null });
      return new Response(JSON.stringify({ success: true, mode: "all", total, hasMore, errors: errors.length, pagina }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (mode === "especiais") {
      const r = await ingestEspeciais(supabase, { pagina, tamanho, uf });
      await supabase.from("ingestao_logs").insert({ fonte: "TRANSFEREGOV_ESPECIAIS", endpoint: `especiais p${pagina} uf=${uf || "todas"}`, registros_processados: r.total, status: r.errors.length ? "parcial" : "sucesso", erro: r.errors.join("; ").slice(0, 1000) || null });
      return new Response(JSON.stringify({ success: true, ...r, mode, pagina }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (mode === "convenios" || mode === "parcerias") {
      const r = await ingestConvenios(supabase, { pagina, tamanho, uf });
      await supabase.from("ingestao_logs").insert({ fonte: "TRANSFEREGOV_CONVENIOS", endpoint: `convenios p${pagina} uf=${uf || "todas"}`, registros_processados: r.total, status: r.errors.length ? "parcial" : "sucesso", erro: r.errors.join("; ").slice(0, 1000) || null });
      return new Response(JSON.stringify({ success: true, ...r, mode, pagina }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (mode === "test") {
      // Testa conectividade sem gravar
      const u = `${ENDPOINTS.especiais}?pagina=1&tamanhoPagina=1`;
      const resp = await fetchWithRetry(u);
      const ok = resp.ok;
      const sample = ok ? (await resp.json().catch(() => null)) : null;
      const count = Array.isArray(sample) ? sample.length : (sample?.data?.length ?? 0);
      return new Response(JSON.stringify({ success: ok, status: resp.status, sampleCount: count, endpoint: u }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "mode inválido: use especiais | convenios | all | test" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("ingest-transferegov error", e);
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
