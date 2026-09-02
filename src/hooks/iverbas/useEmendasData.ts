import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface EmendaRow {
  id: string;
  ano: number;
  codigo_emenda: string;
  autor_nome: string;
  autor_tipo: string | null;
  autor_uf: string | null;
  partido: string | null;
  orgao_codigo: string | null;
  orgao_nome: string | null;
  funcao: string | null;
  subfuncao: string | null;
  localidade: string | null;
  valor_empenhado: number;
  valor_liquidado: number;
  valor_pago: number;
  valor_restos_pagar: number;
  docs_enriched_at: string | null;
  docs_count: number;
}

export interface EmendaDocumento {
  ano: number;
  codigo_emenda: string;
  documento_id: string | null;
  orgao_codigo: string | null;
  orgao_nome: string | null;
  orgao_superior_codigo: string | null;
  orgao_superior_nome: string | null;
  unidade_gestora_codigo: string | null;
  fase: string | null;
  valor_empenhado: number;
  valor_liquidado: number;
  valor_pago: number;
  updated_at: string | null;
}

export interface AutorRanking {
  nome: string;
  tipo: string;
  uf: string | null;
  partido: string | null;
  empenhado: number;
  liquidado: number;
  pago: number;
  emendas: number;
  taxaExecucao: number;
}

export interface OrgaoRanking {
  codigo: string;
  nome: string;
  empenhado: number;
  liquidado: number;
  pago: number;
  emendas: number;
  taxaExecucao: number;
}

export interface EnrichmentStatus {
  total: number;
  enriched: number;
  pending: number;
  withDocs: number;
}

export interface CoverageCycle {
  hora: string;
  docs: number;
  comOrgao: number;
  semOrgao: number;
}

export interface CoverageStatus {
  docsTotal: number;
  docsComOrgao: number;
  docsComUG: number;
  docsIndisponiveis: number;
  docsPendentes: number;
  emendasTotal: number;
  emendasEnriquecidas: number;
  emendasComDocs: number;
  emendasPendentes: number;
  ciclos: CoverageCycle[];
  ultimoCiclo: string | null;
}

export interface EmendasResult {
  rows: EmendaRow[];
  docs: EmendaDocumento[];
  totals: {
    empenhado: number;
    liquidado: number;
    pago: number;
    restos: number;
    emendas: number;
    autores: number;
  };
  porAutor: AutorRanking[];
  porOrgao: OrgaoRanking[];
  porTipo: { tipo: string; pago: number }[];
  porFuncao: { funcao: string; pago: number }[];
  enrichment: EnrichmentStatus;
  coverage: CoverageStatus;
}

const PAGE_SIZE = 1000;

export function useEmendasData(ano: number = 2026) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<EmendasResult | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Emendas
      let all: EmendaRow[] = [];
      let page = 0;
      while (true) {
        const { data: batch, error } = await supabase
          .from("emendas_parlamentares")
          .select("*")
          .eq("ano", ano)
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (error) { console.error("emendas fetch error", error); break; }
        if (!batch || batch.length === 0) break;
        all = all.concat(batch as EmendaRow[]);
        if (batch.length < PAGE_SIZE) break;
        page++;
      }

      // 2. Documentos (para ranking por órgão)
      let docs: EmendaDocumento[] = [];
      let dpage = 0;
      while (true) {
        const { data: batch, error } = await supabase
          .from("emendas_documentos")
          .select("ano, codigo_emenda, documento_id, orgao_codigo, orgao_nome, orgao_superior_codigo, orgao_superior_nome, unidade_gestora_codigo, fase, valor_empenhado, valor_liquidado, valor_pago, updated_at")
          .eq("ano", ano)
          .range(dpage * PAGE_SIZE, (dpage + 1) * PAGE_SIZE - 1);
        if (error) { console.error("docs fetch error", error); break; }
        if (!batch || batch.length === 0) break;
        docs = docs.concat(batch as EmendaDocumento[]);
        if (batch.length < PAGE_SIZE) break;
        dpage++;
      }

      const totals = { empenhado: 0, liquidado: 0, pago: 0, restos: 0, emendas: 0, autores: 0 };
      const autorMap: Record<string, AutorRanking> = {};
      const tipoMap: Record<string, number> = {};
      const funcaoMap: Record<string, number> = {};
      const codigosUnicos = new Set<string>();

      for (const r of all) {
        totals.empenhado += Number(r.valor_empenhado) || 0;
        totals.liquidado += Number(r.valor_liquidado) || 0;
        totals.pago += Number(r.valor_pago) || 0;
        totals.restos += Number(r.valor_restos_pagar) || 0;
        codigosUnicos.add(r.codigo_emenda);

        const aKey = r.autor_nome;
        if (!autorMap[aKey]) {
          autorMap[aKey] = {
            nome: r.autor_nome,
            tipo: r.autor_tipo || "desconhecido",
            uf: r.autor_uf,
            partido: r.partido,
            empenhado: 0, liquidado: 0, pago: 0, emendas: 0, taxaExecucao: 0,
          };
        }
        autorMap[aKey].empenhado += Number(r.valor_empenhado) || 0;
        autorMap[aKey].liquidado += Number(r.valor_liquidado) || 0;
        autorMap[aKey].pago += Number(r.valor_pago) || 0;
        autorMap[aKey].emendas += 1;

        const t = r.autor_tipo || "desconhecido";
        tipoMap[t] = (tipoMap[t] || 0) + (Number(r.valor_pago) || 0);

        const f = r.funcao || "Não classificada";
        funcaoMap[f] = (funcaoMap[f] || 0) + (Number(r.valor_pago) || 0);
      }

      // Órgão: agrega documentos por orgao_superior (mais estável p/ ministério)
      const orgaoMap: Record<string, OrgaoRanking & { _emendas: Set<string> }> = {};
      for (const d of docs) {
        // Skip rows not yet enriched or marked as unavailable by the API
        if (!d.orgao_codigo || d.orgao_codigo === "NAO_DISPONIVEL") continue;
        const codigo = d.orgao_superior_codigo || d.orgao_codigo;
        const nome = d.orgao_superior_nome || d.orgao_nome || "Não identificado";
        const key = codigo;
        if (!orgaoMap[key]) {
          orgaoMap[key] = {
            codigo, nome,
            empenhado: 0, liquidado: 0, pago: 0, emendas: 0, taxaExecucao: 0,
            _emendas: new Set<string>(),
          };
        }
        orgaoMap[key].empenhado += Number(d.valor_empenhado) || 0;
        orgaoMap[key].liquidado += Number(d.valor_liquidado) || 0;
        orgaoMap[key].pago += Number(d.valor_pago) || 0;
        orgaoMap[key]._emendas.add(d.codigo_emenda);
      }


      totals.emendas = codigosUnicos.size;
      totals.autores = Object.keys(autorMap).length;

      const porAutor = Object.values(autorMap)
        .map(a => ({ ...a, taxaExecucao: a.empenhado > 0 ? (a.pago / a.empenhado) * 100 : 0 }))
        .sort((a, b) => b.pago - a.pago);
      const porOrgao = Object.values(orgaoMap)
        .map(o => ({
          codigo: o.codigo, nome: o.nome,
          empenhado: o.empenhado, liquidado: o.liquidado, pago: o.pago,
          emendas: o._emendas.size,
          taxaExecucao: o.empenhado > 0 ? (o.pago / o.empenhado) * 100 : 0,
        }))
        .sort((a, b) => Math.max(b.pago, b.empenhado) - Math.max(a.pago, a.empenhado));
      const porTipo = Object.entries(tipoMap).map(([tipo, pago]) => ({ tipo, pago })).sort((a, b) => b.pago - a.pago);
      const porFuncao = Object.entries(funcaoMap).map(([funcao, pago]) => ({ funcao, pago })).sort((a, b) => b.pago - a.pago);

      const enriched = all.filter(r => r.docs_enriched_at).length;
      const withDocs = all.filter(r => (r.docs_count || 0) > 0).length;
      const enrichment: EnrichmentStatus = {
        total: all.length, enriched, pending: all.length - enriched, withDocs,
      };

      // Coverage por ciclo do cron (agrupa updated_at por hora)
      const ciclosMap: Record<string, CoverageCycle> = {};
      let docsComOrgao = 0, docsComUG = 0, docsIndisponiveis = 0, ultimoCiclo: string | null = null;
      for (const d of docs) {
        const enriquecido = !!d.orgao_codigo && d.orgao_codigo !== "NAO_DISPONIVEL";
        if (enriquecido) docsComOrgao += 1;
        if (d.unidade_gestora_codigo) docsComUG += 1;
        if (d.orgao_codigo === "NAO_DISPONIVEL") docsIndisponiveis += 1;
        if (d.updated_at) {
          const hora = d.updated_at.slice(0, 13) + ":00:00Z";
          if (!ciclosMap[hora]) ciclosMap[hora] = { hora, docs: 0, comOrgao: 0, semOrgao: 0 };
          ciclosMap[hora].docs += 1;
          if (enriquecido) ciclosMap[hora].comOrgao += 1; else ciclosMap[hora].semOrgao += 1;
          if (!ultimoCiclo || d.updated_at > ultimoCiclo) ultimoCiclo = d.updated_at;
        }
      }
      const ciclos = Object.values(ciclosMap).sort((a, b) => b.hora.localeCompare(a.hora)).slice(0, 24);
      const coverage: CoverageStatus = {
        docsTotal: docs.length,
        docsComOrgao,
        docsComUG,
        docsIndisponiveis,
        docsPendentes: docs.length - docsComOrgao - docsIndisponiveis,
        emendasTotal: all.length,
        emendasEnriquecidas: enriched,
        emendasComDocs: withDocs,
        emendasPendentes: all.length - enriched,
        ciclos,
        ultimoCiclo,
      };

      setData({ rows: all, docs, totals, porAutor, porOrgao, porTipo, porFuncao, enrichment, coverage });
    } catch (e) {
      console.error("useEmendasData", e);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [ano]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { loading, data, refetch: fetchData };
}
