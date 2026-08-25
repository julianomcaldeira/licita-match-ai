import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface BudgetSummary {
  totalCommitted: number;   // empenhado
  totalSettled: number;     // liquidado
  totalPaid: number;        // pago
  pendingPayment: number;   // empenhado - pago (a pagar)
  executionRate: number;    // pago / empenhado %
  year: number;
}

export interface OrganExecution {
  organ: string;
  committed: number;   // empenhado
  settled: number;     // liquidado
  paid: number;        // pago
}

export interface TopCompany {
  cnpj: string;
  name: string;
  totalPaid: number;
  percentage: number;
}

export function useBudgetData() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [organExecution, setOrganExecution] = useState<OrganExecution[]>([]);
  const [topCompanies, setTopCompanies] = useState<TopCompany[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const ano = new Date().getFullYear();

    try {
      // PRIMARY SOURCE: orcamento_unificado (canonical model)
      const { data: unifiedBudget } = await supabase
        .from("orcamento_unificado")
        .select("orgao_nome, orgao_codigo, empenhado_total, liquidado_total, pago_total")
        .eq("ano", ano);

      if (unifiedBudget && unifiedBudget.length > 0) {
        const totalCommitted = unifiedBudget.reduce((s, r) => s + (r.empenhado_total || 0), 0);
        const totalSettled = unifiedBudget.reduce((s, r) => s + (r.liquidado_total || 0), 0);
        const totalPaid = unifiedBudget.reduce((s, r) => s + (r.pago_total || 0), 0);

        setSummary({
          totalCommitted,
          totalSettled,
          totalPaid,
          pendingPayment: Math.max(0, totalCommitted - totalPaid),
          executionRate: totalCommitted > 0 ? (totalPaid / totalCommitted) * 100 : 0,
          year: ano,
        });

        // Organ execution from unified budget
        const organs: OrganExecution[] = unifiedBudget
          .filter(r => r.empenhado_total > 0 || r.pago_total > 0)
          .map(r => ({
            organ: r.orgao_nome,
            committed: r.empenhado_total || 0,
            settled: r.liquidado_total || 0,
            paid: r.pago_total || 0,
          }))
          .sort((a, b) => b.committed - a.committed)
          .slice(0, 5);

        setOrganExecution(organs);

        // Top companies from contratos_comprasgov
        const PAGE_SIZE = 1000;
        let allContracts: any[] = [];
        let page = 0;
        let hasMore = true;

        while (hasMore) {
          const { data: batch } = await supabase
            .from("contratos_comprasgov")
            .select("cnpj_fornecedor, nome_fornecedor, valor")
            .eq("ano", ano)
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

          if (!batch || batch.length === 0) { hasMore = false; break; }
          allContracts = allContracts.concat(batch);
          if (batch.length < PAGE_SIZE) hasMore = false;
          page++;
        }

        if (allContracts.length > 0) {
          const companyMap: Record<string, { name: string; cnpj: string; totalPaid: number }> = {};
          let grandTotal = 0;
          for (const c of allContracts) {
            const key = c.cnpj_fornecedor;
            if (!companyMap[key]) {
              companyMap[key] = { name: c.nome_fornecedor, cnpj: c.cnpj_fornecedor, totalPaid: 0 };
            }
            companyMap[key].totalPaid += c.valor || 0;
            grandTotal += c.valor || 0;
          }

          setTopCompanies(
            Object.values(companyMap)
              .filter(c => c.totalPaid > 0)
              .sort((a, b) => b.totalPaid - a.totalPaid)
              .slice(0, 10)
              .map(c => ({
                ...c,
                percentage: grandTotal > 0 ? Number(((c.totalPaid / grandTotal) * 100).toFixed(2)) : 0,
              }))
          );
        }
      } else {
        // FALLBACK: legacy tables
        const { data: execData } = await supabase
          .from("execucao_despesa")
          .select("orgao, valor_empenhado, valor_liquidado, valor_pago, nome_favorecido, cnpj_favorecido")
          .eq("ano", ano);

        const totalCommitted = execData?.reduce((s, r) => s + (r.valor_empenhado || 0), 0) || 0;
        const totalSettled = execData?.reduce((s, r) => s + (r.valor_liquidado || 0), 0) || 0;
        const totalPaid = execData?.reduce((s, r) => s + (r.valor_pago || 0), 0) || 0;

        setSummary({
          totalCommitted,
          totalSettled,
          totalPaid,
          pendingPayment: Math.max(0, totalCommitted - totalPaid),
          executionRate: totalCommitted > 0 ? (totalPaid / totalCommitted) * 100 : 0,
          year: ano,
        });

        // Organ execution from legacy
        const execByOrgan: Record<string, { committed: number; settled: number; paid: number }> = {};
        execData?.forEach(r => {
          if (r.orgao) {
            if (!execByOrgan[r.orgao]) execByOrgan[r.orgao] = { committed: 0, settled: 0, paid: 0 };
            execByOrgan[r.orgao].committed += r.valor_empenhado || 0;
            execByOrgan[r.orgao].settled += r.valor_liquidado || 0;
            execByOrgan[r.orgao].paid += r.valor_pago || 0;
          }
        });

        setOrganExecution(
          Object.entries(execByOrgan)
            .map(([organ, v]) => ({ organ, committed: v.committed, settled: v.settled, paid: v.paid }))
            .sort((a, b) => b.committed - a.committed)
            .slice(0, 8)
        );

        // Top companies from legacy
        const companyMap: Record<string, { name: string; cnpj: string; totalPaid: number }> = {};
        execData?.forEach(r => {
          const key = r.cnpj_favorecido || r.nome_favorecido || "Desconhecido";
          if (!companyMap[key]) {
            companyMap[key] = { name: r.nome_favorecido || "Desconhecido", cnpj: r.cnpj_favorecido || "", totalPaid: 0 };
          }
          companyMap[key].totalPaid += r.valor_pago || 0;
        });

        setTopCompanies(
          Object.values(companyMap)
            .filter(c => c.totalPaid > 0)
            .sort((a, b) => b.totalPaid - a.totalPaid)
            .slice(0, 10)
            .map(c => ({ ...c, percentage: totalPaid > 0 ? Number(((c.totalPaid / totalPaid) * 100).toFixed(2)) : 0 }))
        );
      }
    } catch (err) {
      console.error("Error fetching budget data:", err);
    } finally {
      setLoading(false);
    }
  }

  return { loading, summary, organExecution, topCompanies, refetch: fetchData };
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: value >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}
