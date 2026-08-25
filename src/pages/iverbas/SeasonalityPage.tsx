import React from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/i18n/LanguageContext";
import { useBudgetData, formatBRL } from "@/hooks/iverbas/useBudgetData";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import InfoTooltip from "@/components/iverbas/InfoTooltip";

const SeasonalityPage: React.FC = () => {
  const { t } = useLanguage();
  const { loading, organExecution } = useBudgetData();

  if (loading) {
    return (
      <div className="p-6 lg:p-8 flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const sorted = [...organExecution].sort((a, b) => b.committed - a.committed);

  const chartData = sorted.map((o) => ({
    name: o.organ.replace("Ministério ", "Min. ").replace(" e ", " e\n"),
    pago: o.paid,
    empenhado: o.committed,
  }));

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
        {t("seasonality")} — 2025
        <InfoTooltip text="Mostra em quais meses o governo gasta mais e em quais gasta menos. Ajuda a entender os períodos de maior e menor atividade de cada órgão." />
      </h1>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border p-5 shadow-card">
        <h2 className="font-display font-semibold text-foreground mb-4">{t("executionByOrgan")}</h2>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(140 15% 89%)" />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "hsl(150 10% 45%)" }} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis tickFormatter={(v) => formatBRL(v)} tick={{ fontSize: 10, fill: "hsl(150 10% 45%)" }} />
              <Tooltip formatter={(v: number) => formatBRL(v)} />
              <Bar dataKey="empenhado" name={t("committed")} fill="hsl(145 55% 40%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="pago" name={t("paid")} fill="hsl(45 93% 55%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <div className="p-5 border-b border-border">
          <h2 className="font-display font-semibold text-foreground">{t("paid")} {t("byOrgan")}</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="text-left py-3 px-4 text-muted-foreground font-medium">{t("organ")}</th>
              <th className="text-right py-3 px-4 text-muted-foreground font-medium">{t("committed")}</th>
              <th className="text-right py-3 px-4 text-muted-foreground font-medium">{t("paid")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((o) => (
              <tr key={o.organ} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className="py-3 px-4 font-medium text-foreground">{o.organ}</td>
                <td className="py-3 px-4 text-right text-muted-foreground">{formatBRL(o.committed)}</td>
                <td className="py-3 px-4 text-right font-semibold text-foreground">{formatBRL(o.paid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>
    </div>
  );
};

export default SeasonalityPage;
