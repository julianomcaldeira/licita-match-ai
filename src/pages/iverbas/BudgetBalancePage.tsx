import React from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/i18n/LanguageContext";
import { useBudgetData, formatBRL } from "@/hooks/iverbas/useBudgetData";
import { Wallet, FileCheck, CreditCard, Target } from "lucide-react";
import InfoTooltip from "@/components/iverbas/InfoTooltip";

const BudgetBalancePage: React.FC = () => {
  const { t } = useLanguage();
  const { loading, summary, organExecution } = useBudgetData();

  if (loading || !summary) {
    return (
      <div className="p-6 lg:p-8 flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const organs = [...organExecution]
    .map((o) => ({
      ...o,
      pending: Math.max(0, o.committed - o.paid),
      executionPct: o.committed > 0 ? ((o.paid / o.committed) * 100).toFixed(1) : "0.0",
    }))
    .sort((a, b) => b.committed - a.committed);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
        {t("budgetBalance")} — {summary.year}
        <InfoTooltip text="Mostra a relação entre o que foi empenhado (reservado) e o que foi efetivamente pago por cada órgão." />
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Empenhado", value: formatBRL(summary.totalCommitted), icon: FileCheck },
          { label: "Total Liquidado", value: formatBRL(summary.totalSettled), icon: Target },
          { label: "Total Pago", value: formatBRL(summary.totalPaid), icon: CreditCard },
          { label: "A Pagar", value: formatBRL(summary.pendingPayment), icon: Wallet },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.08 }}
            className="bg-card rounded-xl border border-border p-5 shadow-card"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">{s.label}</p>
                <p className="text-xl font-display font-bold text-foreground">{s.value}</p>
              </div>
              <div className="p-2 rounded-lg bg-accent">
                <s.icon className="w-4 h-4 text-primary" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="bg-card rounded-xl border border-border shadow-card overflow-hidden"
      >
        <div className="p-5 border-b border-border">
          <h2 className="font-display font-semibold text-foreground">{t("budgetBalance")} {t("byOrgan")}</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="text-left py-3 px-4 text-muted-foreground font-medium">{t("organ")}</th>
              <th className="text-right py-3 px-4 text-muted-foreground font-medium">{t("committed")}</th>
              <th className="text-right py-3 px-4 text-muted-foreground font-medium">{t("settled")}</th>
              <th className="text-right py-3 px-4 text-muted-foreground font-medium">{t("paid")}</th>
              <th className="text-right py-3 px-4 text-muted-foreground font-medium">A Pagar</th>
              <th className="text-right py-3 px-4 text-muted-foreground font-medium">{t("executionRate")}</th>
            </tr>
          </thead>
          <tbody>
            {organs.map((o) => (
              <tr key={o.organ} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className="py-3 px-4 font-medium text-foreground">{o.organ}</td>
                <td className="py-3 px-4 text-right text-muted-foreground">{formatBRL(o.committed)}</td>
                <td className="py-3 px-4 text-right text-muted-foreground">{formatBRL(o.settled)}</td>
                <td className="py-3 px-4 text-right font-semibold text-foreground">{formatBRL(o.paid)}</td>
                <td className="py-3 px-4 text-right font-semibold text-primary">{formatBRL(o.pending)}</td>
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full gradient-brand" style={{ width: `${Math.min(Number(o.executionPct), 100)}%` }} />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">{o.executionPct}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>
    </div>
  );
};

export default BudgetBalancePage;
