import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SupplierPlayer {
  cnpj: string;
  name: string;
  totalValue: number;
  contractCount: number;
  ufs: string[];
  categorias: string[];
  orgaos: string[];
  marketShare: number;
}

export interface SuppliersResult {
  suppliers: SupplierPlayer[];
  total: number;
  totalSuppliers: number;
  source: string;
}

const PAGE_SIZE = 1000;

export function useSuppliersData(categoria?: string | null, ano: number = 2026) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SuppliersResult | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let allContracts: any[] = [];
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from("contratos_comprasgov")
          .select("cnpj_fornecedor, nome_fornecedor, valor, uf, categoria, orgao")
          .eq("ano", ano)
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (categoria) query = query.eq("categoria", categoria);

        const { data: batch, error } = await query;

        if (error) {
          console.error("Error fetching contracts page", page, error);
          break;
        }

        if (!batch || batch.length === 0) {
          hasMore = false;
        } else {
          allContracts = allContracts.concat(batch);
          if (batch.length < PAGE_SIZE) hasMore = false;
          page++;
        }
      }

      if (allContracts.length === 0) {
        setData({ suppliers: [], total: 0, totalSuppliers: 0, source: "empty" });
        return;
      }

      // Filter out records where supplier name equals agency name (legacy collector data)
      const realSupplierContracts = allContracts.filter(c =>
        c.nome_fornecedor && c.orgao && c.nome_fornecedor !== c.orgao && c.cnpj_fornecedor
      );

      if (realSupplierContracts.length === 0) {
        setData({ suppliers: [], total: 0, totalSuppliers: 0, source: "empty" });
        return;
      }

      const map: Record<string, SupplierPlayer> = {};
      let grandTotal = 0;

      for (const c of realSupplierContracts) {
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

      setData({
        suppliers: ranked,
        total: grandTotal,
        totalSuppliers: Object.keys(map).length,
        source: "db",
      });
    } catch (err) {
      console.error("Error in useSuppliersData", err);
      setData({ suppliers: [], total: 0, totalSuppliers: 0, source: "empty" });
    } finally {
      setLoading(false);
    }
  }, [categoria, ano]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { loading, data, refetch: fetchData };
}
