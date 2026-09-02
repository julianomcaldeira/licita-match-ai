import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Require authenticated user (JWT validation)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, supabaseKey);

  try {
    const url = new URL(req.url);
    // Support both query params (GET) and body (POST)
    let body: Record<string, string> = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch { body = {}; }
    }
    const action = url.searchParams.get("action") || body.action || "topPlayers";
    const categoria = url.searchParams.get("categoria") || body.categoria || null;
    const ano = parseInt(url.searchParams.get("ano") || body.ano || String(new Date().getFullYear()));
    const cnpj = url.searchParams.get("cnpj") || body.cnpj || null;
    const limitParam = url.searchParams.get("limit") || body.limit || "0";
    const limit = parseInt(limitParam) > 0 ? Math.min(parseInt(limitParam), 10000) : 0; // 0 = no limit

    if (action === "topPlayers") {
      // Fetch all contracts for the year (with optional category filter)
      // Paginated fetch to get ALL contracts
      const PAGE_SIZE = 1000;
      let allContracts: any[] = [];
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        let query = sb
          .from("contratos_comprasgov")
          .select("cnpj_fornecedor, nome_fornecedor, valor, uf, categoria, orgao")
          .eq("ano", ano)
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (categoria) query = query.eq("categoria", categoria);

        const { data: batch, error } = await query;
        if (error) throw error;
        if (!batch || batch.length === 0) { hasMore = false; break; }
        allContracts = allContracts.concat(batch);
        if (batch.length < PAGE_SIZE) hasMore = false;
        page++;
      }

      const contracts = allContracts;


      if (!contracts || contracts.length === 0) {
        return new Response(
          JSON.stringify({ data: [], total: 0, source: "empty" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Aggregate by CNPJ
      const map: Record<string, {
        cnpj: string;
        name: string;
        totalValue: number;
        contractCount: number;
        ufs: Set<string>;
        categorias: Set<string>;
        orgaos: Set<string>;
      }> = {};

      let grandTotal = 0;

      for (const c of contracts) {
        const key = c.cnpj_fornecedor;
        if (!map[key]) {
          map[key] = {
            cnpj: key,
            name: c.nome_fornecedor,
            totalValue: 0,
            contractCount: 0,
            ufs: new Set(),
            categorias: new Set(),
            orgaos: new Set(),
          };
        }
        map[key].totalValue += c.valor || 0;
        map[key].contractCount++;
        if (c.uf) map[key].ufs.add(c.uf);
        if (c.categoria) map[key].categorias.add(c.categoria);
        if (c.orgao) map[key].orgaos.add(c.orgao);
        grandTotal += c.valor || 0;
      }

      const ranked = Object.values(map)
        .map(v => ({
          cnpj: v.cnpj,
          name: v.name,
          totalValue: v.totalValue,
          contractCount: v.contractCount,
          ufs: Array.from(v.ufs),
          categorias: Array.from(v.categorias),
          orgaos: Array.from(v.orgaos),
          marketShare: grandTotal > 0 ? Number(((v.totalValue / grandTotal) * 100).toFixed(2)) : 0,
        }))
        .sort((a, b) => b.totalValue - a.totalValue)
        .slice(0, limit > 0 ? limit : undefined);

      // Concentration metrics
      const top3 = ranked.slice(0, 3).reduce((s, r) => s + r.marketShare, 0);
      const top5 = ranked.slice(0, 5).reduce((s, r) => s + r.marketShare, 0);
      const top10 = ranked.slice(0, 10).reduce((s, r) => s + r.marketShare, 0);

      return new Response(
        JSON.stringify({
          data: ranked,
          total: grandTotal,
          totalCompanies: Object.keys(map).length,
          concentration: { top3, top5, top10 },
          source: "pncp",
          ano,
          categoria,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "buscarConcorrentes" && cnpj) {
      // Find categories this company operates in
      const { data: companyContracts } = await sb
        .from("contratos_comprasgov")
        .select("categoria")
        .eq("cnpj_fornecedor", cnpj)
        .eq("ano", ano);

      const categorias = [...new Set((companyContracts || []).map(c => c.categoria).filter(Boolean))];

      if (categorias.length === 0) {
        return new Response(
          JSON.stringify({ data: [], categorias: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Find competitors in the same categories
      const { data: competitors } = await sb
        .from("contratos_comprasgov")
        .select("cnpj_fornecedor, nome_fornecedor, valor, categoria")
        .eq("ano", ano)
        .in("categoria", categorias)
        .neq("cnpj_fornecedor", cnpj);

      const compMap: Record<string, { cnpj: string; name: string; totalValue: number; count: number }> = {};
      for (const c of (competitors || [])) {
        const k = c.cnpj_fornecedor;
        if (!compMap[k]) compMap[k] = { cnpj: k, name: c.nome_fornecedor, totalValue: 0, count: 0 };
        compMap[k].totalValue += c.valor || 0;
        compMap[k].count++;
      }

      const result = Object.values(compMap)
        .sort((a, b) => b.totalValue - a.totalValue)
        .slice(0, limit > 0 ? limit : 50);

      return new Response(
        JSON.stringify({ data: result, categorias }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: categories summary
    if (action === "categorias") {
      const { data: contracts } = await sb
        .from("contratos_comprasgov")
        .select("categoria, valor")
        .eq("ano", ano);

      const catMap: Record<string, { total: number; count: number }> = {};
      for (const c of (contracts || [])) {
        const cat = c.categoria || "Outros";
        if (!catMap[cat]) catMap[cat] = { total: 0, count: 0 };
        catMap[cat].total += c.valor || 0;
        catMap[cat].count++;
      }

      const result = Object.entries(catMap)
        .map(([categoria, v]) => ({ categoria, ...v }))
        .sort((a, b) => b.total - a.total);

      return new Response(
        JSON.stringify({ data: result, ano }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use: topPlayers, buscarConcorrentes, categorias" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("comprasgov-contracts error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
