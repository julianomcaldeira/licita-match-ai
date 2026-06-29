import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Brain, Database, AlertCircle, CheckCircle2, Clock, Cpu, Building2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type Summary = {
  today: { calls: number; tokens: number; cached: number; errors: number };
  last_7d: { calls: number; tokens: number };
  last_30d: { calls: number; tokens: number };
  period_totals: { calls: number; tokens: number; cached: number; errors: number };
  by_model: { model: string; calls: number; tokens: number }[];
  by_function: { function_name: string; calls: number; tokens: number; cached: number }[];
  by_empresa: { empresa: string; empresa_id: string | null; calls: number; tokens: number }[];
  hourly_24h: { hour: string; calls: number; tokens: number }[];
};

type LogRow = {
  id: string;
  function_name: string;
  model: string | null;
  status: string;
  cached: boolean;
  total_tokens: number | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
  empresa_nome: string | null;
};

const fmt = (n: number) => (n ?? 0).toLocaleString("pt-BR");

const PERIOD_LABEL: Record<string, string> = {
  today: "Hoje",
  "7d": "Últimos 7 dias",
  month: "Este mês",
  "30d": "Últimos 30 dias",
};

interface Props {
  embedded?: boolean;
}

export default function AIMonitorPage({ embedded = false }: Props) {
  const qc = useQueryClient();
  const [period, setPeriod] = useState<string>("today");
  const [empresaId, setEmpresaId] = useState<string>("all");

  const empresas = useQuery({
    queryKey: ["empresas-select-ai"],
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas_clientes").select("id, nome").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const empresaFilter = empresaId === "all" ? null : empresaId;

  const summary = useQuery({
    queryKey: ["ai-usage-summary", period, empresaFilter],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ai_usage_summary", { p_period: period, p_empresa_id: empresaFilter });
      if (error) throw error;
      return data as Summary;
    },
    refetchInterval: 15_000,
  });

  const recent = useQuery({
    queryKey: ["ai-usage-recent", period, empresaFilter],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ai_usage_recent", {
        p_period: period,
        p_empresa_id: empresaFilter,
        p_limit: 50,
      });
      if (error) throw error;
      return (data || []) as LogRow[];
    },
    refetchInterval: 15_000,
  });

  const [liveBadge, setLiveBadge] = useState(false);

  useEffect(() => {
    const ch = supabase
      .channel("ai-usage-log-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ai_usage_log" }, () => {
        setLiveBadge(true);
        setTimeout(() => setLiveBadge(false), 1500);
        qc.invalidateQueries({ queryKey: ["ai-usage-summary"] });
        qc.invalidateQueries({ queryKey: ["ai-usage-recent"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const s = summary.data;
  const max = Math.max(1, ...(s?.hourly_24h?.map((h) => h.calls) || [1]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {!embedded && (
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
              <Brain className="h-6 w-6 text-primary" /> Consumo de IA
            </h1>
            <p className="text-sm text-muted-foreground">
              Cada chamada de IA do sistema é registrada aqui em tempo real (cache, modelo, tokens, duração).
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="month">Este mês</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <Select value={empresaId} onValueChange={setEmpresaId}>
              <SelectTrigger className="h-9 w-[220px]"><SelectValue placeholder="Todas as empresas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as empresas</SelectItem>
                {empresas.data?.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Badge variant={liveBadge ? "default" : "secondary"} className="gap-1.5">
            <span className={`h-2 w-2 rounded-full ${liveBadge ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/50"}`} />
            Realtime
          </Badge>
        </div>
      </div>

      {/* KPIs (filtered by period + empresa) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Activity} label={`Chamadas · ${PERIOD_LABEL[period]}`} value={fmt(s?.period_totals.calls ?? 0)} sub={`${fmt(s?.period_totals.tokens ?? 0)} tokens`} />
        <Kpi icon={Database} label="Cache hits" value={fmt(s?.period_totals.cached ?? 0)} sub={`${pct(s?.period_totals.cached, s?.period_totals.calls)} dos hits`} />
        <Kpi icon={AlertCircle} label="Erros" value={fmt(s?.period_totals.errors ?? 0)} sub={s?.period_totals.errors ? "atenção" : "tudo ok"} tone={s?.period_totals.errors ? "warn" : "ok"} />
        <Kpi icon={Clock} label="Hoje (referência)" value={fmt(s?.today.calls ?? 0)} sub={`${fmt(s?.today.tokens ?? 0)} tokens`} />
      </div>

      {/* 24h chart */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">Últimas 24h (chamadas por hora)</h2>
          <span className="text-xs text-muted-foreground">7d total: <b>{fmt(s?.last_7d.calls ?? 0)}</b> chamadas · <b>{fmt(s?.last_7d.tokens ?? 0)}</b> tokens</span>
        </div>
        <div className="flex items-end gap-1 h-32">
          {(s?.hourly_24h || []).length === 0 && <p className="text-xs text-muted-foreground">Sem chamadas nas últimas 24h.</p>}
          {(s?.hourly_24h || []).map((h) => (
            <div key={h.hour} className="flex-1 flex flex-col items-center gap-1" title={`${h.hour} — ${h.calls} chamadas`}>
              <div className="w-full rounded-t bg-primary/70 hover:bg-primary transition" style={{ height: `${(h.calls / max) * 100}%` }} />
              <span className="text-[9px] text-muted-foreground">{h.hour.slice(11, 13)}h</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* By empresa */}
        <Card className="p-5">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Por empresa</h2>
          <div className="space-y-2">
            {(s?.by_empresa || []).map((e, i) => (
              <div key={`${e.empresa_id || "none"}-${i}`} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-xs text-foreground truncate">{e.empresa}</span>
                <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                  <span><b className="text-foreground">{fmt(e.calls)}</b></span>
                  <span>{fmt(e.tokens)} tokens</span>
                </div>
              </div>
            ))}
            {!s?.by_empresa?.length && <p className="text-xs text-muted-foreground">Sem dados no período.</p>}
          </div>
        </Card>

        {/* By model */}
        <Card className="p-5">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Cpu className="h-4 w-4 text-primary" /> Por modelo</h2>
          <div className="space-y-2">
            {(s?.by_model || []).map((m) => (
              <div key={m.model} className="flex items-center justify-between gap-2 text-sm">
                <span className="font-mono text-xs text-foreground truncate">{m.model}</span>
                <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                  <span><b className="text-foreground">{fmt(m.calls)}</b></span>
                  <span>{fmt(m.tokens)} tokens</span>
                </div>
              </div>
            ))}
            {!s?.by_model?.length && <p className="text-xs text-muted-foreground">Sem dados no período.</p>}
          </div>
        </Card>

        {/* By function */}
        <Card className="p-5">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Por função</h2>
          <div className="space-y-2">
            {(s?.by_function || []).map((f) => (
              <div key={f.function_name} className="flex items-center justify-between gap-2 text-sm">
                <span className="font-mono text-xs text-foreground truncate">{f.function_name}</span>
                <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                  <span><b className="text-foreground">{fmt(f.calls)}</b></span>
                  <span>{fmt(f.cached)} cache</span>
                </div>
              </div>
            ))}
            {!s?.by_function?.length && <p className="text-xs text-muted-foreground">Sem dados no período.</p>}
          </div>
        </Card>
      </div>

      {/* Recent calls */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold mb-3">Últimas 50 chamadas no período</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left py-2 px-2">Quando</th>
                <th className="text-left px-2">Empresa</th>
                <th className="text-left px-2">Função</th>
                <th className="text-left px-2">Modelo</th>
                <th className="text-right px-2">Tokens</th>
                <th className="text-right px-2">Duração</th>
                <th className="text-center px-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(recent.data || []).map((r) => (
                <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30">
                  <td className="py-1.5 px-2 text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}</td>
                  <td className="px-2 text-foreground">{r.empresa_nome || <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-2 font-mono">{r.function_name}</td>
                  <td className="px-2 font-mono text-muted-foreground">{r.model || "—"}{r.cached && <Badge variant="secondary" className="ml-1.5 text-[9px] py-0">cache</Badge>}</td>
                  <td className="px-2 text-right">{r.total_tokens ? fmt(r.total_tokens) : "—"}</td>
                  <td className="px-2 text-right">{r.duration_ms ? `${r.duration_ms}ms` : "—"}</td>
                  <td className="px-2 text-center">
                    {r.status === "success"
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 inline" />
                      : <span title={r.error_message || ""}><AlertCircle className="h-3.5 w-3.5 text-destructive inline" /></span>}
                  </td>
                </tr>
              ))}
              {!recent.data?.length && (
                <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Nenhuma chamada registrada no período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone }: { icon: any; label: string; value: string; sub?: string; tone?: "ok" | "warn" }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${tone === "warn" ? "text-amber-500" : "text-primary"}`} />
      </div>
      <div className="mt-1 text-2xl font-bold text-foreground">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}

function pct(part?: number, total?: number) {
  if (!part || !total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}
