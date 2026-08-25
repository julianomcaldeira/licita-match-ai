import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CompanyPlayer {
  cnpj: string;
  name: string;
  totalValue: number;
  contractCount: number;
  ufs: string[];
  categorias: string[];
  orgaos: string[];
  marketShare: number;
}

export interface CompaniesData {
  companies: CompanyPlayer[];
  total: number;
  totalCompanies: number;
  concentration: { top3: number; top5: number; top10: number };
  source: string;
}

export function useCompaniesData(categoria?: string | null, ano?: number) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CompaniesData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const year = ano || new Date().getFullYear();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const bodyParams: Record<string, string> = {
        action: "topPlayers",
        ano: String(year),
      };
      if (categoria) bodyParams.categoria = categoria;

      const { data: resp, error: fnError } = await supabase.functions.invoke(
        "comprasgov-contracts",
        { body: bodyParams }
      );

      // If edge function fails, try direct DB query as fallback
      if (fnError || !resp) {
        console.warn("Edge function failed, using direct DB query:", fnError);
        await fetchFromDB(year, categoria || undefined);
        return;
      }

      setData({
        companies: resp.data || [],
        total: resp.total || 0,
        totalCompanies: resp.totalCompanies || 0,
        concentration: resp.concentration || { top3: 0, top5: 0, top10: 0 },
        source: resp.source || "pncp",
      });
    } catch (err: any) {
      console.warn("Function invoke failed, falling back to DB:", err);
      await fetchFromDB(year, categoria || undefined);
    } finally {
      setLoading(false);
    }
  }, [year, categoria]);

  async function fetchFromDB(ano: number, cat?: string) {
    try {
      const PAGE_SIZE = 1000;
      let allContracts: any[] = [];
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from("contratos_comprasgov")
          .select("cnpj_fornecedor, nome_fornecedor, valor, uf, categoria, orgao")
          .eq("ano", ano)
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (cat) query = query.eq("categoria", cat);

        const { data: batch, error: dbErr } = await query;
        if (dbErr) break;
        if (!batch || batch.length === 0) { hasMore = false; break; }
        allContracts = allContracts.concat(batch);
        if (batch.length < PAGE_SIZE) hasMore = false;
        page++;
      }

      const contracts = allContracts;

      if (!contracts || contracts.length === 0) {
        // No real data yet — set empty
        setData({
          companies: [],
          total: 0,
          totalCompanies: 0,
          concentration: { top3: 0, top5: 0, top10: 0 },
          source: "empty",
        });
        return;
      }

      // Aggregate locally
      const map: Record<string, CompanyPlayer> = {};
      let grandTotal = 0;

      for (const c of contracts) {
        const key = c.cnpj_fornecedor;
        if (!map[key]) {
          map[key] = {
            cnpj: key,
            name: c.nome_fornecedor,
            totalValue: 0,
            contractCount: 0,
            ufs: [],
            categorias: [],
            orgaos: [],
            marketShare: 0,
          };
        }
        map[key].totalValue += c.valor || 0;
        map[key].contractCount++;
        if (c.uf && !map[key].ufs.includes(c.uf)) map[key].ufs.push(c.uf);
        if (c.categoria && !map[key].categorias.includes(c.categoria)) map[key].categorias.push(c.categoria);
        if (c.orgao && !map[key].orgaos.includes(c.orgao)) map[key].orgaos.push(c.orgao);
        grandTotal += c.valor || 0;
      }

      const ranked = Object.values(map)
        .map(v => ({ ...v, marketShare: grandTotal > 0 ? Number(((v.totalValue / grandTotal) * 100).toFixed(2)) : 0 }))
        .sort((a, b) => b.totalValue - a.totalValue);

      const top3 = ranked.slice(0, 3).reduce((s, r) => s + r.marketShare, 0);
      const top5 = ranked.slice(0, 5).reduce((s, r) => s + r.marketShare, 0);
      const top10 = ranked.slice(0, 10).reduce((s, r) => s + r.marketShare, 0);

      setData({
        companies: ranked,
        total: grandTotal,
        totalCompanies: Object.keys(map).length,
        concentration: { top3, top5, top10 },
        source: "db",
      });
    } catch (err) {
      console.error("DB fallback error:", err);
      setData({ companies: [], total: 0, totalCompanies: 0, concentration: { top3: 0, top5: 0, top10: 0 }, source: "empty" });
    }
  }

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { loading, data, error, refetch: fetchData };
}
