import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OrgaoPotencial {
  orgao: string;
  uf: string;
  orcamentoAutorizado: number | null;
  totalEmpenhado: number;
  totalPago: number;
  saldoDisponivel: number | null;
  pctExecutado: number | null;
  historicoCompraSegmento: number;
  contratosSegmento: number;
  crescimentoExecucao: number | null;
  scorePotencial: number;
}

export interface PotencialResult {
  orgaos: OrgaoPotencial[];
  totalGeral: number;
  totalSaldo: null;
  validacao: {
    disponivel: false;
    motivo: string;
  };
}

// Sem dotação orçamentária real (PNCP/comprasgov não expõe), só "historico" é sinal real.
const PESOS = {
  historico: 1,
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
      const budgetMap: Record<string, { empenhado: number; pago: number }> = {};
      for (const o of orcamento) {
        const key = o.orgao_nome;
        if (!budgetMap[key]) {
          budgetMap[key] = { empenhado: 0, pago: 0 };
        }
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

      const rawData: Array<{
        orgao: string;
        uf: string;
        empenhado: number;
        pago: number;
        historicoSegmento: number;
        contratosSegmento: number;
      }> = [];

      for (const orgao of allOrgaos) {
        const budget = budgetMap[orgao] || { empenhado: 0, pago: 0 };
        const segmento = segmentoMap[orgao] || { valor: 0, contratos: 0, uf: "" };

        // Only include organs with budget OR segment activity
        if (budget.empenhado === 0 && segmento.valor === 0) continue;

        if (segmento.valor > maxHistorico) maxHistorico = segmento.valor;

        rawData.push({
          orgao,
          uf: segmento.uf,
          empenhado: budget.empenhado,
          pago: budget.pago,
          historicoSegmento: segmento.valor,
          contratosSegmento: segmento.contratos,
        });
      }

      for (const r of rawData) {
        const normHistorico = maxHistorico > 0 ? r.historicoSegmento / maxHistorico : 0;
        const score = normHistorico * PESOS.historico * 100;

        results.push({
          orgao: r.orgao,
          uf: r.uf,
          orcamentoAutorizado: null,
          totalEmpenhado: r.empenhado,
          totalPago: r.pago,
          saldoDisponivel: null,
          pctExecutado: null,
          historicoCompraSegmento: r.historicoSegmento,
          contratosSegmento: r.contratosSegmento,
          crescimentoExecucao: null,
          scorePotencial: Number(score.toFixed(1)),
        });
      }

      results.sort((a, b) => b.scorePotencial - a.scorePotencial);

      setData({
        orgaos: results,
        totalGeral: results.reduce((s, r) => s + r.historicoCompraSegmento, 0),
        totalSaldo: null,
        validacao: {
          disponivel: false,
          motivo: "PNCP/comprasgov não expõe dotação orçamentária — saldo e % executado não são calculáveis hoje.",
        },
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
