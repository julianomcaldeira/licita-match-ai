import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertTriangle, Clock, Database, Gauge, Loader2, Trophy, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const DAILY_CAPACITY = 500; // regra de ouro: 500 registros/dia por job


function fmt(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("pt-BR");
}

function etaDias(qtd: number) {
  if (!qtd) return "—";
  const dias = Math.ceil(qtd / DAILY_CAPACITY);
  return `${dias} dia${dias > 1 ? "s" : ""}`;
}

type Resumo = {
  total_no_sistema: number;
  gaps: number;
  orgaos_com_gap: number;
  homologadas_sem_vencedores: number;
  faltando_total: number;
  pct_cobertura: number;
  ingeridas_24h: number;
  ingeridas_7d: number;
  velocidade_dia: number;
  eta_dias: number | null;
  ultima_ingestao: string | null;
  fila_atualizada_em: string | null;
};

export function CoberturaTab() {
  const resumo = useQuery({
    queryKey: ["cobertura-resumo"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("cobertura_resumo");
      if (error) throw error;
      return (data?.[0] ?? null) as Resumo | null;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const gaps = useQuery({
    queryKey: ["cobertura-gaps"],
    queryFn: async () => {
      const [{ data: sum, error: e1 }, { data: top, error: e2 }] = await Promise.all([
        (supabase.rpc as any)("gap_queue_summary"),
        (supabase.rpc as any)("gap_queue_top_orgaos", { p_limit: 10 }),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const s = sum?.[0] ?? { pending: 0, processing: 0, orgaos: 0 };
      return {
        total_gaps: Number(s.pending ?? 0) + Number(s.processing ?? 0),
        orgaos_com_gap: Number(s.orgaos ?? 0),
        top_orgaos: (top ?? []) as Array<{
          cnpj: string;
          ano: number;
          gaps: number;
          max_seq: number;
        }>,
      };
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });


  const reprocess = useQuery({
    queryKey: ["cobertura-reprocess"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pncp_reprocess_summary");
      if (error) throw error;
      return (data?.[0] ?? { total: 0, por_ano: [] }) as {
        total: number;
        por_ano: Array<{ ano: number; qtd: number }>;
      };
    },
    staleTime: 5 * 60_000,
  });

  const clientes = useQuery({
    queryKey: ["cobertura-clientes"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("cobertura_por_cliente");
      if (error) throw error;
      return (data ?? []) as Array<{
        empresa_id: string;
        nome: string;
        total_licitacoes: number;
        sem_vencedores: number;
        homologadas: number;
        homologadas_sem_vencedores: number;
      }>;
    },
    staleTime: 5 * 60_000,
  });

  const autoscale = useQuery({
    queryKey: ["cobertura-autoscale"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cron_autoscale_state")
        .select("target,limit_per_run,parallelism,last_decision_at,last_reason,last_metrics,budget_ms")
        .order("target");
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const loading = gaps.isLoading || reprocess.isLoading || clientes.isLoading;
  const totalPendente = (gaps.data?.total_gaps ?? 0) + (reprocess.data?.total ?? 0);


  const summary = [
    {
      label: "Buracos de sequência (PNCP)",
      value: fmt(gaps.data?.total_gaps),
      hint: `${fmt(gaps.data?.orgaos_com_gap)} órgãos afetados`,
      icon: AlertTriangle,
      color: "text-warning",
    },
    {
      label: "Homologadas sem vencedores",
      value: fmt(reprocess.data?.total),
      hint: "aguardando reprocessamento",
      icon: Trophy,
      color: "text-primary",
    },
    {
      label: "Backlog total",
      value: fmt(totalPendente),
      hint: `${DAILY_CAPACITY}/dia · ETA ${etaDias(totalPendente)}`,
      icon: Clock,
      color: "text-module-purple",
    },
    {
      label: "Clientes monitorados",
      value: fmt(clientes.data?.length),
      hint: "cobertura por vínculo",
      icon: Users,
      color: "text-module-teal",
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const r = resumo.data;
  const pct = r?.pct_cobertura ?? 0;
  const eta = r?.eta_dias ?? null;
  const etaTexto =
    eta == null
      ? "sem ingestão medida — fila parada"
      : eta > 730
        ? `${(eta / 365).toFixed(1)} anos no ritmo atual`
        : `${fmt(Math.round(eta))} dias no ritmo atual`;

  return (
    <div className="space-y-6">
      {/* Hero: quanto falta */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Cobertura da base (PNCP 2023+)
            </p>
            <p className="mt-1 font-display text-5xl font-bold text-foreground">
              {pct.toFixed(1)}%
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {fmt(r?.total_no_sistema)} licitações no sistema ·{" "}
              <span className="font-semibold text-warning">{fmt(r?.faltando_total)} ainda faltam</span>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              ["Faltam buscar", fmt(r?.gaps), "compras não ingeridas"],
              ["Sem vencedor", fmt(r?.homologadas_sem_vencedores), "homologadas pendentes"],
              ["Velocidade real", `${fmt(Math.round(r?.velocidade_dia ?? 0))}/dia`, `${fmt(r?.ingeridas_24h)} nas últimas 24h`],
              ["Previsão", etaTexto, "para zerar a fila"],
            ].map(([label, value, hint]) => (
              <div key={String(label)}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-display text-lg font-bold text-foreground">{value}</p>
                <p className="text-[11px] text-muted-foreground">{hint}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-5 h-3 w-full overflow-hidden rounded-full bg-secondary">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(pct, 100)}%` }}
            transition={{ duration: 0.8 }}
            className="h-full rounded-full bg-primary"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {fmt(r?.orgaos_com_gap)} órgãos com dados faltando · última licitação gravada:{" "}
          {r?.ultima_ingestao ? new Date(r.ultima_ingestao).toLocaleString("pt-BR") : "—"}
        </p>
        {!r?.fila_atualizada_em && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs text-foreground">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
            <span>
              Mapeamento da fila em andamento (roda a cada 30 min). Os números de lacunas
              aparecem assim que o primeiro cálculo terminar.
            </span>
          </div>
        )}

        {(r?.velocidade_dia ?? 0) < 1000 && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>
              Ritmo atual insuficiente para o backlog. Use a aba <strong>Varredura Órgão</strong> para
              priorizar CNPJs específicos enquanto a fila geral avança.
            </span>
          </div>
        )}
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">

        {summary.map((c) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <c.icon className={`h-4 w-4 ${c.color}`} />
              <span className="text-xs font-medium text-muted-foreground">{c.label}</span>
            </div>
            <p className="mt-2 font-display text-2xl font-bold text-foreground">{c.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
          </motion.div>
        ))}
      </div>

      {/* Autoescalonamento */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border p-4 flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" />
          <h3 className="font-display font-semibold text-foreground">Autoescalonamento em tempo real</h3>
          <span className="ml-auto text-xs text-muted-foreground">reavalia a cada 15 min</span>
        </div>
        {autoscale.data?.length ? (
          <div className="table-scroll">
            <table className="table-sticky">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Job</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Registros/rodada</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Paralelismo</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Orçamento</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Última decisão</th>
                </tr>
              </thead>
              <tbody>
                {autoscale.data.map((a: any) => {
                  const m = a.last_metrics ?? {};
                  const decisionColor =
                    a.last_reason?.startsWith("up") ? "text-success" :
                    a.last_reason?.startsWith("down") ? "text-destructive" :
                    "text-muted-foreground";
                  return (
                    <tr key={a.target} className="border-b border-border last:border-0 align-top">
                      <td className="px-4 py-3 font-medium text-foreground">{a.target}</td>
                      <td className="px-4 py-3 text-right font-bold text-primary">{fmt(a.limit_per_run)}</td>
                      <td className="px-4 py-3 text-right text-foreground">{a.parallelism}x</td>
                      <td className="px-4 py-3 text-right text-muted-foreground text-xs">{Math.round((a.budget_ms ?? 0) / 1000)}s</td>
                      <td className="px-4 py-3 text-xs">
                        <div className={`font-medium ${decisionColor}`}>{a.last_reason ?? "—"}</div>
                        <div className="text-muted-foreground mt-1">
                          {a.last_decision_at ? new Date(a.last_decision_at).toLocaleString("pt-BR") : "—"}
                          {m?.avg_duration_ms ? ` · duração média ${(m.avg_duration_ms / 1000).toFixed(1)}s` : ""}
                          {m?.http_429 ? ` · ${m.http_429} rate-limits` : ""}
                          {m?.error_rate != null ? ` · ${Math.round(m.error_rate * 100)}% erros` : ""}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-sm text-muted-foreground text-center">
            Aguardando primeira decisão do autoscaler…
          </div>
        )}
      </div>

      {/* Explicação */}

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm text-sm text-muted-foreground">
        <div className="flex items-center gap-2 font-medium text-foreground mb-1">
          <Database className="h-4 w-4 text-primary" />
          Como calculamos
        </div>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Buracos de sequência:</strong> por órgão + ano, comparamos a maior sequência PNCP conhecida com o que já foi ingerido; a diferença é o que ainda falta buscar.</li>
          <li><strong>Homologadas sem vencedores:</strong> licitações com resultado publicado que ainda não têm registro de vencedor no banco.</li>
          <li><strong>Regra de Ouro:</strong> dois crons diários (06:00 e 06:30 UTC) processam até {DAILY_CAPACITY} registros cada para zerar a fila.</li>
        </ul>
      </div>

      {/* Fila por ano */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border p-4">
          <h3 className="font-display font-semibold text-foreground">Homologadas sem vencedores — por ano</h3>
        </div>
        {reprocess.data?.por_ano?.length ? (
          <div className="table-scroll">
            <table className="table-sticky">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Ano</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Pendentes</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">ETA</th>
                </tr>
              </thead>
              <tbody>
                {reprocess.data.por_ano.map((r) => (
                  <tr key={r.ano} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">{r.ano}</td>
                    <td className="px-4 py-3 text-right text-foreground">{fmt(r.qtd)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground text-xs">{etaDias(r.qtd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-sm text-muted-foreground text-center">Nenhuma pendência encontrada 🎉</div>
        )}
      </div>

      {/* Top órgãos com gaps */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border p-4">
          <h3 className="font-display font-semibold text-foreground">Top órgãos com buracos de sequência</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Ordenados pela quantidade de compras que faltam ser buscadas.
          </p>
        </div>
        {gaps.data?.top_orgaos?.length ? (
          <div className="table-scroll">
            <table className="table-sticky">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">CNPJ do órgão</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Ano</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Última seq. conhecida</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Faltando</th>
                </tr>
              </thead>
              <tbody>
                {gaps.data.top_orgaos.map((o, i) => (
                  <tr key={`${o.cnpj}-${o.ano}-${i}`} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{o.cnpj}</td>
                    <td className="px-4 py-3 text-foreground">{o.ano}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{fmt(o.max_seq)}</td>
                    <td className="px-4 py-3 text-right font-bold text-warning">{fmt(o.gaps)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-sm text-muted-foreground text-center">Sem buracos detectados 🎉</div>
        )}
      </div>

      {/* Cobertura por cliente */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border p-4">
          <h3 className="font-display font-semibold text-foreground">Cobertura por cliente</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Licitações vinculadas via CNPJ + palavras-chave (tabela <code>cliente_vinculos</code>).
          </p>
        </div>
        {clientes.data?.length ? (
          <div className="table-scroll">
            <table className="table-sticky">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Cliente</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Vínculos</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Homologadas</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Homologadas s/ vencedor</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Cobertura</th>
                </tr>
              </thead>
              <tbody>
                {clientes.data.map((c) => {
                  const cobertura = c.homologadas > 0
                    ? Math.round(((c.homologadas - c.homologadas_sem_vencedores) / c.homologadas) * 100)
                    : 100;
                  const color = cobertura >= 90 ? "text-success" : cobertura >= 70 ? "text-warning" : "text-destructive";
                  return (
                    <tr key={c.empresa_id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-foreground">{c.nome}</td>
                      <td className="px-4 py-3 text-right text-foreground">{fmt(c.total_licitacoes)}</td>
                      <td className="px-4 py-3 text-right text-foreground">{fmt(c.homologadas)}</td>
                      <td className="px-4 py-3 text-right text-warning">{fmt(c.homologadas_sem_vencedores)}</td>
                      <td className={`px-4 py-3 text-right font-bold ${color}`}>{cobertura}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-sm text-muted-foreground text-center">Nenhum cliente cadastrado.</div>
        )}
      </div>
    </div>
  );
}
