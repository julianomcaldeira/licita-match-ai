import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/i18n/LanguageContext";
import DataQualityBadge from "@/components/iverbas/DataQualityBadge";
import {
  ArrowLeft,
  FileText,
  Search,
  Loader2,
  AlertTriangle,
  ChevronRight,
  CalendarDays,
  Wallet,
  FileCheck,
  Landmark,
  Building2,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════
interface Contrato {
  contrato_id_externo: string;
  numero_contrato: string | null;
  unidade_codigo: string | null;
  unidade_nome: string | null;
  orgao_codigo: string | null;
  orgao_nome: string | null;
  fornecedor_cnpj: string | null;
  fornecedor_nome: string | null;
  objeto: string | null;
  valor_global: number | null;
  valor_acumulado: number | null;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  situacao: string | null;
}

interface Empenho {
  id: string;
  contrato_id_externo: string;
  numero_empenho: string;
  unidade_gestora: string | null;
  fornecedor_cnpj: string | null;
  valor_empenhado: number | null;
  valor_liquidado: number | null;
  valor_pago: number | null;
  valor_rp_inscrito: number | null;
  data_emissao: string | null;
}

const fmtBRL = (n: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n || 0);

const fmtBRLDecimal = (n: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
};

const fmtCnpj = (cnpj: string | null) => {
  if (!cnpj) return "—";
  const d = cnpj.replace(/\D+/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
};

const daysUntil = (iso: string | null): number | null => {
  if (!iso) return null;
  const end = new Date(iso);
  if (Number.isNaN(end.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

// ═══════════════════════════════════════════════════════════
// Ficha do Contrato (state-based, no route change)
// ═══════════════════════════════════════════════════════════
const ContractDetail: React.FC<{ contrato: Contrato; onBack: () => void }> = ({ contrato, onBack }) => {
  const { t } = useLanguage();
  const [empenhos, setEmpenhos] = useState<Empenho[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("contrato_empenhos")
        .select("*")
        .eq("contrato_id_externo", contrato.contrato_id_externo)
        .order("data_emissao", { ascending: false });
      setEmpenhos((data as Empenho[]) || []);
      setLoading(false);
    })();
  }, [contrato.contrato_id_externo]);

  const totals = useMemo(() => {
    return empenhos.reduce(
      (acc, e) => {
        acc.empenhado += Number(e.valor_empenhado || 0);
        acc.liquidado += Number(e.valor_liquidado || 0);
        acc.pago += Number(e.valor_pago || 0);
        return acc;
      },
      { empenhado: 0, liquidado: 0, pago: 0 },
    );
  }, [empenhos]);

  const valorGlobal = Number(contrato.valor_global || 0);
  const saldo = Math.max(valorGlobal - totals.empenhado, 0);
  const execPct = valorGlobal > 0 ? Math.min((totals.empenhado / valorGlobal) * 100, 100) : 0;

  const cards = [
    { label: t("contractCardValorGlobal"), value: fmtBRL(valorGlobal), icon: Wallet, color: "text-primary" },
    { label: t("contractCardTotalEmpenhado"), value: fmtBRL(totals.empenhado), icon: FileCheck, color: "text-blue-600" },
    { label: t("contractCardTotalLiquidado"), value: fmtBRL(totals.liquidado), icon: FileCheck, color: "text-amber-600" },
    { label: t("contractCardTotalPago"), value: fmtBRL(totals.pago), icon: FileCheck, color: "text-green-600" },
    { label: t("contractCardSaldo"), value: fmtBRL(saldo), icon: Wallet, color: "text-muted-foreground" },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {t("contractDetailBack")}
      </button>

      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-display font-bold text-foreground">{t("contractDetailTitle")}</h1>
          <DataQualityBadge variant="official" />
        </div>
        <p className="text-xs text-muted-foreground mt-1">{t("contractsSourceBadge")}</p>
      </div>

      {/* Contract header info */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-card space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{t("contractDetailNumero")}</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">{contrato.numero_contrato || contrato.contrato_id_externo}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{t("contractDetailSituacao")}</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">{contrato.situacao || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{t("contractDetailFornecedor")}</p>
            <p className="text-sm text-foreground mt-0.5">{contrato.fornecedor_nome || "—"}</p>
            <p className="text-xs font-mono text-muted-foreground mt-0.5">{fmtCnpj(contrato.fornecedor_cnpj)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{t("contractDetailOrgao")}</p>
            <p className="text-sm text-foreground mt-0.5">{contrato.orgao_nome || "—"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {contrato.unidade_codigo ? `UG ${contrato.unidade_codigo}` : ""} {contrato.unidade_nome ? `— ${contrato.unidade_nome}` : ""}
            </p>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{t("contractDetailObjeto")}</p>
            <p className="text-sm text-foreground mt-0.5 leading-relaxed">{contrato.objeto || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{t("contractDetailVigencia")}</p>
            <p className="text-sm text-foreground mt-0.5">
              {fmtDate(contrato.vigencia_inicio)} → {fmtDate(contrato.vigencia_fim)}
            </p>
          </div>
        </div>
      </div>

      {/* Value cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-card rounded-xl border border-border p-4 shadow-card"
          >
            <div className="flex items-center gap-2">
              <c.icon className={`w-4 h-4 ${c.color}`} />
              <p className="text-xs text-muted-foreground font-medium">{c.label}</p>
            </div>
            <p className="text-lg font-display font-bold text-foreground mt-2">{c.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Execution bar */}
      <div className="bg-card rounded-xl border border-border p-5 shadow-card">
        <div className="flex justify-between items-baseline mb-2">
          <p className="text-sm font-medium text-foreground">{t("contractsExecucaoPct")}</p>
          <p className="text-sm font-semibold text-foreground">{execPct.toFixed(1).replace(".", ",")}%</p>
        </div>
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${execPct}%` }} />
        </div>
      </div>

      {/* Empenhos list */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">
            {t("contractEmpenhosTitle")} <span className="text-muted-foreground font-normal">({empenhos.length})</span>
          </h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : empenhos.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">{t("contractEmpenhosEmpty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b border-border">
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">{t("contractEmpenhoNumero")}</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">{t("contractEmpenhoData")}</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">{t("contractEmpenhoUG")}</th>
                  <th className="text-right py-2.5 px-4 text-xs font-medium text-muted-foreground">{t("contractEmpenhoEmpenhado")}</th>
                  <th className="text-right py-2.5 px-4 text-xs font-medium text-muted-foreground">{t("contractEmpenhoLiquidado")}</th>
                  <th className="text-right py-2.5 px-4 text-xs font-medium text-muted-foreground">{t("contractEmpenhoPago")}</th>
                  <th className="text-right py-2.5 px-4 text-xs font-medium text-muted-foreground">{t("contractEmpenhoRPInscrito")}</th>
                </tr>
              </thead>
              <tbody>
                {empenhos.map((e) => (
                  <tr key={e.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-4 font-mono text-xs text-foreground">{e.numero_empenho}</td>
                    <td className="py-2.5 px-4 text-xs text-muted-foreground">{fmtDate(e.data_emissao)}</td>
                    <td className="py-2.5 px-4 font-mono text-xs text-muted-foreground">{e.unidade_gestora || "—"}</td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-foreground">{fmtBRLDecimal(e.valor_empenhado)}</td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-amber-600">{fmtBRLDecimal(e.valor_liquidado)}</td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-green-600">{fmtBRLDecimal(e.valor_pago)}</td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-muted-foreground">{fmtBRLDecimal(e.valor_rp_inscrito)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// Contract List Page
// ═══════════════════════════════════════════════════════════
const ContractsPage: React.FC = () => {
  const { t } = useLanguage();

  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [empenhosByContrato, setEmpenhosByContrato] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Contrato | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [orgao, setOrgao] = useState<string>("");
  const [situacao, setSituacao] = useState<string>("");
  const [vigencia, setVigencia] = useState<"all" | "expiring" | "expired" | "active">("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("contratos_gestao")
        .select("*")
        .order("vigencia_fim", { ascending: true, nullsFirst: false })
        .limit(2000);
      const rows = (data as Contrato[]) || [];
      setContratos(rows);

      if (rows.length > 0) {
        // Fetch aggregated empenhado per contract in one shot (fallback: N queries capped)
        const ids = rows.map((r) => r.contrato_id_externo);
        const { data: emps } = await supabase
          .from("contrato_empenhos")
          .select("contrato_id_externo, valor_empenhado")
          .in("contrato_id_externo", ids);
        const agg: Record<string, number> = {};
        for (const e of (emps || []) as { contrato_id_externo: string; valor_empenhado: number | null }[]) {
          agg[e.contrato_id_externo] = (agg[e.contrato_id_externo] || 0) + Number(e.valor_empenhado || 0);
        }
        setEmpenhosByContrato(agg);
      }
      setLoading(false);
    })();
  }, []);

  const orgaos = useMemo(() => {
    const set = new Map<string, string>();
    for (const c of contratos) {
      if (c.orgao_codigo) set.set(c.orgao_codigo, c.orgao_nome || c.orgao_codigo);
    }
    return Array.from(set.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [contratos]);

  const situacoes = useMemo(() => {
    const set = new Set<string>();
    for (const c of contratos) if (c.situacao) set.add(c.situacao);
    return Array.from(set).sort();
  }, [contratos]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D+/g, "");
    return contratos.filter((c) => {
      if (orgao && c.orgao_codigo !== orgao) return false;
      if (situacao && c.situacao !== situacao) return false;
      if (q) {
        const hitName = (c.fornecedor_nome || "").toLowerCase().includes(q);
        const hitCnpj = digits && (c.fornecedor_cnpj || "").includes(digits);
        if (!hitName && !hitCnpj) return false;
      }
      if (vigencia !== "all") {
        const d = daysUntil(c.vigencia_fim);
        if (vigencia === "expiring" && (d === null || d < 0 || d > 90)) return false;
        if (vigencia === "expired" && (d === null || d >= 0)) return false;
        if (vigencia === "active" && (d === null || d < 0)) return false;
      }
      return true;
    });
  }, [contratos, search, orgao, situacao, vigencia]);

  if (selected) {
    return <ContractDetail contrato={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-display font-bold text-foreground">{t("contractsPageTitle")}</h1>
          <DataQualityBadge variant="official" />
        </div>
        <p className="text-sm text-muted-foreground mt-1">{t("contractsPageSubtitle")}</p>
        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" />
          {t("contractsSourceBadge")}
        </p>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl border border-border p-4 shadow-card">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("contractsSearch")}
              className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <select
            value={orgao}
            onChange={(e) => setOrgao(e.target.value)}
            className="px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">{t("contractsAllOrgaos")}</option>
            {orgaos.map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
          <select
            value={situacao}
            onChange={(e) => setSituacao(e.target.value)}
            className="px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">{t("contractsAllSituacoes")}</option>
            {situacoes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={vigencia}
            onChange={(e) => setVigencia(e.target.value as typeof vigencia)}
            className="px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="all">{t("contractsVigenciaAll")}</option>
            <option value="active">{t("contractsVigenciaActive")}</option>
            <option value="expiring">{t("contractsVigenciaExpiring")}</option>
            <option value="expired">{t("contractsVigenciaExpired")}</option>
          </select>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          {t("contractsResultsCount").replace("{count}", String(filtered.length))}
        </p>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("contractsLoading")}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">{t("contractsEmpty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr className="border-b border-border">
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">{t("contractsNumero")}</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">{t("contractsFornecedor")}</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">{t("contractsOrgao")}</th>
                  <th className="text-right py-2.5 px-4 text-xs font-medium text-muted-foreground">{t("contractsValorGlobal")}</th>
                  <th className="text-right py-2.5 px-4 text-xs font-medium text-muted-foreground">{t("contractsTotalEmpenhado")}</th>
                  <th className="text-right py-2.5 px-4 text-xs font-medium text-muted-foreground">{t("contractsSaldoEmpenhar")}</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground w-40">{t("contractsExecucaoPct")}</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">{t("contractsVigencia")}</th>
                  <th className="py-2.5 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const global = Number(c.valor_global || 0);
                  const empenhado = empenhosByContrato[c.contrato_id_externo] || 0;
                  const saldo = Math.max(global - empenhado, 0);
                  const pct = global > 0 ? Math.min((empenhado / global) * 100, 100) : 0;
                  const days = daysUntil(c.vigencia_fim);
                  const expiringSoon = days !== null && days >= 0 && days <= 90;
                  const expired = days !== null && days < 0;
                  return (
                    <tr
                      key={c.contrato_id_externo}
                      onClick={() => setSelected(c)}
                      className="border-b border-border/40 hover:bg-muted/40 transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 px-4 font-mono text-xs text-foreground">{c.numero_contrato || c.contrato_id_externo}</td>
                      <td className="py-2.5 px-4">
                        <p className="text-xs text-foreground truncate max-w-[220px]" title={c.fornecedor_nome || ""}>
                          {c.fornecedor_nome || "—"}
                        </p>
                        <p className="text-xs font-mono text-muted-foreground">{fmtCnpj(c.fornecedor_cnpj)}</p>
                      </td>
                      <td className="py-2.5 px-4">
                        <p className="text-xs text-foreground truncate max-w-[200px]" title={c.orgao_nome || ""}>
                          {c.orgao_nome || "—"}
                        </p>
                        <p className="text-xs font-mono text-muted-foreground">{c.unidade_codigo || ""}</p>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs text-foreground">{fmtBRL(global)}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs text-blue-600">{fmtBRL(empenhado)}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs text-foreground">{fmtBRL(saldo)}</td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                            <div className="bg-primary h-full rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-mono text-muted-foreground w-10 text-right">{pct.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <p className="text-xs text-foreground">{fmtDate(c.vigencia_fim)}</p>
                        {expired && (
                          <p className="text-xs text-red-600 flex items-center gap-1 mt-0.5">
                            <AlertTriangle className="w-3 h-3" />
                            {t("contractsExpiredDays").replace("{days}", String(Math.abs(days!)))}
                          </p>
                        )}
                        {expiringSoon && !expired && (
                          <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                            <AlertTriangle className="w-3 h-3" />
                            {days === 0
                              ? t("contractsExpiresToday")
                              : t("contractsExpiresIn").replace("{days}", String(days))}
                          </p>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContractsPage;
