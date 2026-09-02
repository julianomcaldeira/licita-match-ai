import React from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/i18n/LanguageContext";
import { useBudgetData, formatBRL } from "@/hooks/iverbas/useBudgetData";
import { TrendingUp, TrendingDown, DollarSign, FileCheck, CreditCard, Target, Percent } from "lucide-react";
import InfoTooltip from "@/components/iverbas/InfoTooltip";
import DataQualityBadge from "@/components/iverbas/DataQualityBadge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";


const StatCard: React.FC<{
  label: string;
  value: string;
  icon: React.ElementType;
  trend?: number;
  delay?: number;
  accent?: boolean;
  tooltip?: string;
  badge?: "official" | "sample" | "contracts";
}> = ({ label, value, icon: Icon, trend, delay = 0, accent, tooltip, badge }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, delay }}
    className={`rounded-xl border border-border p-5 shadow-card ${accent ? "gradient-brand text-primary-foreground" : "bg-card"}`}
  >
    <div className="flex items-start justify-between">
      <div>
        <p className={`text-sm mb-1 flex items-center gap-1 ${accent ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
          {label}
          {tooltip && <InfoTooltip text={tooltip} className={accent ? "text-primary-foreground/50 hover:text-primary-foreground" : ""} />}
        </p>
        <p className={`text-2xl font-display font-bold ${accent ? "text-primary-foreground" : "text-foreground"}`}>{value}</p>
        {badge && <div className="mt-2"><DataQualityBadge variant={badge} /></div>}
      </div>
      <div className={`p-2.5 rounded-lg ${accent ? "bg-primary-foreground/20" : "bg-accent"}`}>
        <Icon className={`w-5 h-5 ${accent ? "text-primary-foreground" : "text-primary"}`} />
      </div>
    </div>
    {trend !== undefined && (
      <div className={`flex items-center gap-1 mt-3 text-xs font-medium ${
        accent ? "text-primary-foreground/80" : trend >= 0 ? "text-success" : "text-destructive"
      }`}>
        {trend >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
        {Math.abs(trend)}% vs. mês anterior
      </div>
    )}
  </motion.div>
);


const DashboardPage: React.FC = () => {
  const { t } = useLanguage();
  const { loading, summary, organExecution, topCompanies } = useBudgetData();

  if (loading || !summary) {
    return (
      <div className="p-6 lg:p-8 flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
          {t("overview")} — {summary.year}
          <InfoTooltip text="Resumo da execução orçamentária: quanto o governo reservou (empenhado), conferiu (liquidado) e efetivamente pagou neste ano." />
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t("lastUpdate")}: {new Date().toLocaleDateString("pt-BR")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Empenhado" value={formatBRL(summary.totalCommitted)} icon={FileCheck} delay={0} tooltip="Quanto o governo já reservou para compromissos de compras e contratos." badge="official" />
        <StatCard label="Total Liquidado" value={formatBRL(summary.totalSettled)} icon={Target} delay={0.1} tooltip="Quanto já foi conferido e aprovado para pagamento." badge="official" />
        <StatCard label="Total Pago" value={formatBRL(summary.totalPaid)} icon={CreditCard} delay={0.2} tooltip="Quanto já saiu da conta do governo e foi efetivamente pago." badge="official" />

        <StatCard label="Taxa de Execução" value={`${summary.executionRate.toFixed(1)}%`} icon={Percent} delay={0.3} accent tooltip="Percentual do que foi empenhado que já foi efetivamente pago (pago ÷ empenhado)." />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="lg:col-span-2 bg-card rounded-xl border border-border p-5 shadow-card"
        >
          <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
            {t("executionByOrgan")}
            <InfoTooltip text="Comparação entre empenhado, liquidado e pago por ministério." />
          </h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={organExecution.slice(0, 5)} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(140 15% 89%)" />
                <XAxis type="number" tickFormatter={(v) => `${(v / 1_000_000_000).toFixed(0)}B`} tick={{ fontSize: 11, fill: "hsl(150 10% 45%)" }} />
                <YAxis type="category" dataKey="organ" width={200} tick={{ fontSize: 10, fill: "hsl(150 10% 45%)" }} />
                <Tooltip formatter={(v: number) => formatBRL(v)} />
                <Legend />
                <Bar dataKey="committed" name={t("committed")} fill="hsl(210 70% 50%)" radius={[0, 4, 4, 0]} />
                <Bar dataKey="settled" name={t("settled")} fill="hsl(145 55% 40%)" radius={[0, 4, 4, 0]} />
                <Bar dataKey="paid" name={t("paid")} fill="hsl(45 93% 55%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="bg-card rounded-xl border border-border p-5 shadow-card"
        >
          <div className="mb-4">
            <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
              {t("topCompanies")}
              <InfoTooltip text="As empresas que mais receberam contratos do PNCP neste ano." />
              <DataQualityBadge variant="contracts" />
            </h2>
            <p className="text-xs text-muted-foreground mt-1">{t("topCompaniesSubtitle")}</p>
          </div>

          <div className="space-y-3">
            {topCompanies.slice(0, 6).map((c, i) => (
              <div key={c.cnpj || i} className="flex items-center gap-3">
                <span className="text-xs font-bold text-muted-foreground w-5 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBRL(c.totalPaid)}</p>
                </div>
                <span className="text-xs font-semibold text-primary">{c.percentage}%</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default DashboardPage;
