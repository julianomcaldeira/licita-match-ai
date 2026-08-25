import React from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/i18n/LanguageContext";
import { useBudgetData, formatBRL } from "@/hooks/iverbas/useBudgetData";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import InfoTooltip from "@/components/iverbas/InfoTooltip";

const BudgetGrowthPage: React.FC = () => {
  const { t } = useLanguage();
  const { loading, organExecution } = useBudgetData();

  if (loading) {
    return (
      <div className="p-6 lg:p-8 flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const chartData = [...organExecution]
    .map((o) => ({
      organ: o.organ.replace("Ministério ", "Min. "),
      empenhado: o.committed,
      pago: o.paid,
      execPct: o.committed > 0 ? Number(((o.paid / o.committed) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.empenhado - a.empenhado);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
        {t("budgetGrowth")}
        <InfoTooltip text="Compara quanto cada órgão empenhou com quanto efetivamente pagou. A taxa de execução mostra o percentual pago do total empenhado." />
      </h1>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border p-5 shadow-card">
        <h2 className="font-display font-semibold text-foreground mb-4">{t("committed")} vs {t("paid")} {t("byOrgan")}</h2>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(140 15% 89%)" />
              <XAxis type="number" tickFormatter={(v) => formatBRL(v)} tick={{ fontSize: 10, fill: "hsl(150 10% 45%)" }} />
              <YAxis type="category" dataKey="organ" width={200} tick={{ fontSize: 10, fill: "hsl(150 10% 45%)" }} />
              <Tooltip formatter={(v: number) => formatBRL(v)} />
              <Legend />
              <Bar dataKey="empenhado" name={t("committed")} fill="hsl(210 70% 50%)" radius={[0, 4, 4, 0]} />
              <Bar dataKey="pago" name={t("paid")} fill="hsl(145 55% 40%)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="text-left py-3 px-4 text-muted-foreground font-medium">{t("organ")}</th>
              <th className="text-right py-3 px-4 text-muted-foreground font-medium">{t("committed")}</th>
              <th className="text-right py-3 px-4 text-muted-foreground font-medium">{t("paid")}</th>
              <th className="text-right py-3 px-4 text-muted-foreground font-medium">{t("executionRate")}</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((o) => (
              <tr key={o.organ} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className="py-3 px-4 font-medium text-foreground">{o.organ}</td>
                <td className="py-3 px-4 text-right text-muted-foreground">{formatBRL(o.empenhado)}</td>
                <td className="py-3 px-4 text-right font-semibold text-foreground">{formatBRL(o.pago)}</td>
                <td className="py-3 px-4 text-right">
                  <span className={`text-sm font-bold ${o.execPct > 0 ? "text-success" : "text-muted-foreground"}`}>
                    {o.execPct}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>
    </div>
  );
};

export default BudgetGrowthPage;
