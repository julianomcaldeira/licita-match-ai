import React from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/i18n/LanguageContext";
import { useBudgetData } from "@/hooks/iverbas/useBudgetData";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { Timer, ArrowDown, ArrowUp } from "lucide-react";
import InfoTooltip from "@/components/iverbas/InfoTooltip";

const PaymentSpeedPage: React.FC = () => {
  const { t } = useLanguage();
  const { loading, organExecution } = useBudgetData();

  // Derive payment speed proxy: ratio of paid vs committed (higher = faster)
  const speedData = organExecution
    .filter((o) => o.paid > 0)
    .map((o) => ({
      organ: o.organ,
      avgDays: o.committed > 0 ? Math.round((1 - o.paid / o.committed) * 100) : 0,
      totalPayments: Math.round(o.paid),
    }))
    .sort((a, b) => a.avgDays - b.avgDays);

  const avgAll = speedData.length > 0 ? Math.round(speedData.reduce((s, o) => s + o.avgDays, 0) / speedData.length) : 0;

  if (loading) {
    return (
      <div className="p-6 lg:p-8 flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
        {t("paymentSpeed")}
        <InfoTooltip text="Mostra quais órgãos pagam mais rápido e quais demoram mais. Quanto menor o índice, mais rápido o órgão paga suas contas." />
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border p-5 shadow-card">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-accent"><Timer className="w-4 h-4 text-primary" /></div>
            <p className="text-sm text-muted-foreground">{t("avgPaymentDays")}</p>
          </div>
          <p className="text-3xl font-display font-bold text-foreground">{avgAll} <span className="text-base font-normal text-muted-foreground">índice</span></p>
        </motion.div>
        {speedData.length > 0 && (
          <>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl border border-border p-5 shadow-card">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-accent"><ArrowDown className="w-4 h-4 text-success" /></div>
                <p className="text-sm text-muted-foreground">{t("fastestPayers")}</p>
              </div>
              <p className="text-lg font-display font-bold text-foreground">{speedData[0].organ}</p>
              <p className="text-sm text-success font-semibold">{speedData[0].avgDays}</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-xl border border-border p-5 shadow-card">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-destructive/10"><ArrowUp className="w-4 h-4 text-destructive" /></div>
                <p className="text-sm text-muted-foreground">{t("slowestPayers")}</p>
              </div>
              <p className="text-lg font-display font-bold text-foreground">{speedData[speedData.length - 1].organ}</p>
              <p className="text-sm text-destructive font-semibold">{speedData[speedData.length - 1].avgDays}</p>
            </motion.div>
          </>
        )}
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-xl border border-border p-5 shadow-card">
        <h2 className="font-display font-semibold text-foreground mb-4">{t("executionRate")} {t("byOrgan")}</h2>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={speedData} layout="vertical" margin={{ left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(140 15% 89%)" />
              <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(150 10% 45%)" }} />
              <YAxis type="category" dataKey="organ" width={200} tick={{ fontSize: 10, fill: "hsl(150 10% 45%)" }} />
              <Tooltip />
              <Bar dataKey="avgDays" radius={[0, 4, 4, 0]}>
                {speedData.map((entry, i) => (
                  <Cell key={i} fill={entry.avgDays <= avgAll ? "hsl(145 55% 40%)" : "hsl(25 85% 55%)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
    </div>
  );
};

export default PaymentSpeedPage;
