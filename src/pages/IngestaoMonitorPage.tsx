import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Database,
  Activity,
  RefreshCw,
  Loader2,
} from "lucide-react";

function StatusIcon({ status }: { status: string }) {
  if (status === "sucesso")
    return <CheckCircle2 className="h-5 w-5 text-success" />;
  if (status === "parcial")
    return <AlertTriangle className="h-5 w-5 text-warning" />;
  return <XCircle className="h-5 w-5 text-destructive" />;
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function IngestaoMonitorPage() {
  const {
    data: logs,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["ingestao-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ingestao_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  const { data: stats } = useQuery({
    queryKey: ["ingestao-stats"],
    queryFn: async () => {
      const [totalLic, totalItens, totalVenc] = await Promise.all([
        supabase.from("licitacoes").select("*", { count: "exact", head: true }),
        supabase.from("licitacao_itens").select("*", { count: "exact", head: true }),
        supabase.from("licitacao_vencedores").select("*", { count: "exact", head: true }),
      ]);
      return {
        licitacoes: totalLic.count ?? 0,
        itens: totalItens.count ?? 0,
        vencedores: totalVenc.count ?? 0,
      };
    },
    refetchInterval: 30000,
  });

  const successCount = logs?.filter((l) => l.status === "sucesso").length ?? 0;
  const errorCount = logs?.filter((l) => l.status !== "sucesso" && l.status !== "parcial").length ?? 0;
  const parcialCount = logs?.filter((l) => l.status === "parcial").length ?? 0;

  const summaryCards = [
    {
      label: "Total Licitações",
      value: stats?.licitacoes.toLocaleString("pt-BR") ?? "—",
      icon: Database,
      color: "text-primary",
    },
    {
      label: "Itens Processados",
      value: stats?.itens.toLocaleString("pt-BR") ?? "—",
      icon: Activity,
      color: "text-module-teal",
    },
    {
      label: "Vencedores",
      value: stats?.vencedores.toLocaleString("pt-BR") ?? "—",
      icon: CheckCircle2,
      color: "text-success",
    },
    {
      label: "Execuções c/ Sucesso",
      value: successCount.toString(),
      icon: CheckCircle2,
      color: "text-success",
    },
    {
      label: "Execuções Parciais",
      value: parcialCount.toString(),
      icon: AlertTriangle,
      color: "text-warning",
    },
    {
      label: "Execuções c/ Erro",
      value: errorCount.toString(),
      icon: XCircle,
      color: "text-destructive",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Monitor de Ingestão
          </h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe as execuções diárias automáticas do PNCP
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex h-10 items-center gap-2 rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground hover:bg-secondary transition disabled:opacity-50"
        >
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Atualizar
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {summaryCards.map((card) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <card.icon className={`h-4 w-4 ${card.color}`} />
              <span className="text-xs font-medium text-muted-foreground">
                {card.label}
              </span>
            </div>
            <p className="mt-2 font-display text-xl font-bold text-foreground">
              {card.value}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Cron schedule info */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Clock className="h-4 w-4 text-primary" />
          Agendamento Automático
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary" />
            Ingestão PNCP: <strong className="text-foreground">01:00 AM (UTC)</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-module-purple" />
            Busca Vencedores: <strong className="text-foreground">02:00 AM (UTC)</strong>
          </span>
        </div>
      </div>

      {/* Log table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !logs || logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Clock className="h-12 w-12 text-muted-foreground" />
          <h2 className="mt-4 font-display text-lg font-semibold text-foreground">
            Nenhuma execução registrada
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            O primeiro ciclo automático será executado à 01:00 AM (UTC).
          </p>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Fonte
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Endpoint
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Registros
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Período
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Executado em
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Erro
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-border last:border-0 hover:bg-secondary/30 transition"
                  >
                    <td className="px-4 py-3">
                      <StatusIcon status={log.status} />
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {log.fonte}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                      {log.endpoint}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {log.registros_processados?.toLocaleString("pt-BR") ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {log.data_inicio || "—"} → {log.data_fim || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="px-4 py-3 max-w-[200px] truncate text-xs text-destructive">
                      {log.erro || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
}
