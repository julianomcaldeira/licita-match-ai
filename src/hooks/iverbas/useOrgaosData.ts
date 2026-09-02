import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OrgaoData {
  orgao: string;
  ministerio: string;
  totalValue: number;
  contractCount: number;
  ufs: string[];
  categorias: string[];
  fornecedores: number;
  marketShare: number;
}

export interface OrgaosResult {
  orgaos: OrgaoData[];
  total: number;
  totalOrgaos: number;
  source: string;
}

export function useOrgaosData(categoria?: string | null, ano: number = 2026) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<OrgaosResult | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const PAGE_SIZE = 1000;
      let allContracts: any[] = [];
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from("contratos_comprasgov")
          .select("orgao, valor, uf, categoria, cnpj_fornecedor")
          .eq("ano", ano)
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (categoria) query = query.eq("categoria", categoria);

        const { data: batch, error } = await query;
        if (error) break;
        if (!batch || batch.length === 0) { hasMore = false; break; }
        allContracts = allContracts.concat(batch);
        if (batch.length < PAGE_SIZE) hasMore = false;
        page++;
      }

      if (allContracts.length === 0) {
        setData({ orgaos: [], total: 0, totalOrgaos: 0, source: "empty" });
        return;
      }

      // Fetch ministry mapping
      const { data: mappings } = await supabase
        .from("orgao_ministerio_map")
        .select("orgao_nome, ministerio");
      
      const ministerioMap: Record<string, string> = {};
      if (mappings) {
        for (const m of mappings) {
          ministerioMap[m.orgao_nome.toUpperCase()] = m.ministerio;
        }
      }

      const contracts = allContracts;

      const map: Record<string, OrgaoData> = {};
      let grandTotal = 0;

      for (const c of contracts) {
        const key = c.orgao || "Não informado";
        if (!map[key]) {
          const upperKey = key.toUpperCase();
          map[key] = {
            orgao: key,
            ministerio: ministerioMap[upperKey] || "",
            totalValue: 0,
            contractCount: 0,
            ufs: [],
            categorias: [],
            fornecedores: 0,
            marketShare: 0,
          };
        }
        map[key].totalValue += c.valor || 0;
        map[key].contractCount++;
        if (c.uf && !map[key].ufs.includes(c.uf)) map[key].ufs.push(c.uf);
        if (c.categoria && !map[key].categorias.includes(c.categoria)) map[key].categorias.push(c.categoria);
        grandTotal += c.valor || 0;
      }

      // Count unique fornecedores per orgao
      const fornecedorSets: Record<string, Set<string>> = {};
      for (const c of contracts) {
        const key = c.orgao || "Não informado";
        if (!fornecedorSets[key]) fornecedorSets[key] = new Set();
        if (c.cnpj_fornecedor) fornecedorSets[key].add(c.cnpj_fornecedor);
      }
      for (const key of Object.keys(map)) {
        map[key].fornecedores = fornecedorSets[key]?.size || 0;
      }

      const ranked = Object.values(map)
        .map(v => ({ ...v, marketShare: grandTotal > 0 ? Number(((v.totalValue / grandTotal) * 100).toFixed(2)) : 0 }))
        .sort((a, b) => b.totalValue - a.totalValue);

      setData({
        orgaos: ranked,
        total: grandTotal,
        totalOrgaos: Object.keys(map).length,
        source: "db",
      });
    } catch {
      setData({ orgaos: [], total: 0, totalOrgaos: 0, source: "empty" });
    } finally {
      setLoading(false);
    }
  }, [categoria, ano]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { loading, data, refetch: fetchData };
}
