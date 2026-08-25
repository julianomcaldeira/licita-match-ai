import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OrgaoPotencial {
  orgao: string;
  uf: string;
  orcamentoAutorizado: number;
  totalEmpenhado: number;
  totalPago: number;
  saldoDisponivel: number;
  pctExecutado: number;
  historicoCompraSegmento: number;
  contratosSegmento: number;
  crescimentoExecucao: number;
  scorePotencial: number;
}

export interface PotencialResult {
  orgaos: OrgaoPotencial[];
  totalGeral: number;
  totalSaldo: number;
  validacao: {
    somaOrcamento: number;
    somaEmpenhado: number;
    somaSaldo: number;
    divergencia: boolean;
  };
}

const PESOS = {
  historico: 0.4,
  saldo: 0.35,
  crescimento: 0.25,
};

const PAGE_SIZE = 1000;

async function fetchAllContratos(select: string, filters: Record<string, any> = {}) {
  let all: any[] = [];
  let page = 0;
  let hasMore = true;
  while (hasMore) {
    let query = supabase.from("contratos_comprasgov").select(select).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (filters.ano) query = query.eq("ano", filters.ano);
    if (filters.categoria) query = query.eq("categoria", filters.categoria);
    const { data: batch, error } = await query;
    if (error || !batch || batch.length === 0) { hasMore = false; break; }
    all = all.concat(batch);
    if (batch.length < PAGE_SIZE) hasMore = false;
    page++;
  }
  return all;
}

async function fetchAllOrcamento(ano: number) {
  let all: any[] = [];
  let page = 0;
  let hasMore = true;
  while (hasMore) {
    const { data: batch, error } = await supabase
      .from("orcamento_unificado")
      .select("orgao_nome, empenhado_total, liquidado_total, pago_total")
      .eq("ano", ano)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error || !batch || batch.length === 0) { hasMore = false; break; }
    all = all.concat(batch);
    if (batch.length < PAGE_SIZE) hasMore = false;
    page++;
  }
  return all;
}

export function usePotencialCompra(
  filtroTipo: "categoria" | "palavra-chave",
  filtroValor: string,
  ano: number = 2026
) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PotencialResult | null>(null);

  const fetchData = useCallback(async () => {
    if (!filtroValor.trim()) {
      setData(null);
      return;
    }

    setLoading(true);
    try {
      // 1. Fetch budget data by orgao
      const orcamento = await fetchAllOrcamento(ano);

      // 2. Fetch contracts filtered by category or keyword
      let contratos: any[];
      const selectFields = "orgao, nome_fornecedor, cnpj_fornecedor, valor, objeto, categoria, uf";
      if (filtroTipo === "categoria") {
        contratos = await fetchAllContratos(selectFields, { ano, categoria: filtroValor });
      } else {
        // Keyword search - fetch all then filter client-side
        const allContratos = await fetchAllContratos(selectFields, { ano });
        const kw = filtroValor.toLowerCase();
        contratos = allContratos.filter(c =>
          (c.objeto && c.objeto.toLowerCase().includes(kw)) ||
          (c.nome_fornecedor && c.nome_fornecedor.toLowerCase().includes(kw)) ||
          (c.categoria && c.categoria.toLowerCase().includes(kw))
        );
      }

      // 3. Build orgao budget map
      const budgetMap: Record<string, { orcamento: number; empenhado: number; pago: number }> = {};
      for (const o of orcamento) {
        const key = o.orgao_nome;
        if (!budgetMap[key]) {
          budgetMap[key] = { orcamento: 0, empenhado: 0, pago: 0 };
        }
        // API doesn't provide dotação, use empenhado as base
        budgetMap[key].orcamento += Number(o.empenhado_total) || 0;
        budgetMap[key].empenhado += Number(o.empenhado_total) || 0;
        budgetMap[key].pago += Number(o.pago_total) || 0;
      }

      // 4. Build segment spending map from contracts
      const segmentoMap: Record<string, { valor: number; contratos: number; uf: string }> = {};
      for (const c of contratos) {
        const key = c.orgao || "Não informado";
        if (!segmentoMap[key]) {
          segmentoMap[key] = { valor: 0, contratos: 0, uf: c.uf || "" };
        }
        segmentoMap[key].valor += Number(c.valor) || 0;
        segmentoMap[key].contratos++;
        if (!segmentoMap[key].uf && c.uf) segmentoMap[key].uf = c.uf;
      }

      // 5. Merge and calculate scores
      const allOrgaos = new Set([...Object.keys(budgetMap), ...Object.keys(segmentoMap)]);
      const results: OrgaoPotencial[] = [];

      // Normalize values for scoring
      let maxHistorico = 0;
      let maxSaldo = 0;

      const rawData: Array<{
        orgao: string;
        uf: string;
        orcamento: number;
        empenhado: number;
        pago: number;
        historicoSegmento: number;
        contratosSegmento: number;
        saldo: number;
        pctExecutado: number;
      }> = [];

      for (const orgao of allOrgaos) {
        const budget = budgetMap[orgao] || { orcamento: 0, empenhado: 0, pago: 0 };
        const segmento = segmentoMap[orgao] || { valor: 0, contratos: 0, uf: "" };

        // Only include organs with budget OR segment activity
        if (budget.orcamento === 0 && segmento.valor === 0) continue;

        const saldo = budget.orcamento - budget.empenhado;
        const pctExecutado = budget.orcamento > 0 ? (budget.empenhado / budget.orcamento) * 100 : 0;

        if (segmento.valor > maxHistorico) maxHistorico = segmento.valor;
        if (saldo > maxSaldo) maxSaldo = saldo;

        rawData.push({
          orgao,
          uf: segmento.uf,
          orcamento: budget.orcamento,
          empenhado: budget.empenhado,
          pago: budget.pago,
          historicoSegmento: segmento.valor,
          contratosSegmento: segmento.contratos,
          saldo,
          pctExecutado,
        });
      }

      // Calculate normalized scores
      for (const r of rawData) {
        const normHistorico = maxHistorico > 0 ? r.historicoSegmento / maxHistorico : 0;
        const normSaldo = maxSaldo > 0 ? Math.max(0, r.saldo) / maxSaldo : 0;
        // Growth proxy: organs executing faster (higher %) but still have budget = growing demand
        const crescimento = r.pctExecutado > 50 && r.saldo > 0 ? (r.pctExecutado / 100) : r.pctExecutado > 0 ? (r.pctExecutado / 200) : 0;

        const score = (
          normHistorico * PESOS.historico +
          normSaldo * PESOS.saldo +
          crescimento * PESOS.crescimento
        ) * 100;

        results.push({
          orgao: r.orgao,
          uf: r.uf,
          orcamentoAutorizado: r.orcamento,
          totalEmpenhado: r.empenhado,
          totalPago: r.pago,
          saldoDisponivel: r.saldo,
          pctExecutado: Number(r.pctExecutado.toFixed(1)),
          historicoCompraSegmento: r.historicoSegmento,
          contratosSegmento: r.contratosSegmento,
          crescimentoExecucao: Number((r.pctExecutado).toFixed(1)),
          scorePotencial: Number(score.toFixed(1)),
        });
      }

      results.sort((a, b) => b.scorePotencial - a.scorePotencial);

      // 6. Validation
      const somaOrcamento = results.reduce((s, r) => s + r.orcamentoAutorizado, 0);
      const somaEmpenhado = results.reduce((s, r) => s + r.totalEmpenhado, 0);
      const somaSaldo = results.reduce((s, r) => s + r.saldoDisponivel, 0);
      const divergencia = Math.abs(somaOrcamento - somaEmpenhado - somaSaldo) > 0.01;

      setData({
        orgaos: results,
        totalGeral: somaOrcamento,
        totalSaldo: somaSaldo,
        validacao: { somaOrcamento, somaEmpenhado, somaSaldo, divergencia },
      });
    } catch (err) {
      console.error("Error in usePotencialCompra", err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [filtroTipo, filtroValor, ano]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { loading, data, refetch: fetchData };
}
