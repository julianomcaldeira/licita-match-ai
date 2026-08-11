import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import {
  LineChart, Line, Area, AreaChart, ComposedChart, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine, Dot,
} from "recharts";
import {
  RefreshCw, Download, Copy, AlertTriangle, TrendingUp, TrendingDown, FileDown,
} from "lucide-react";
import IndiceStartGiCard from "@/components/indice-startgi/IndiceStartGiCard";
import {
  IndiceData, buildPostText, formatBRL, formatNum, formatPct,
  getLastClosedMonth, listMonthOptions, mesAbrev, mesLabel, nextMonthName,
} from "@/lib/indiceStartGi";

const PAGE_SIZE = 12;

export default function IndiceStartGiPage() {
  const { role } = useAuth();
  const allowed = role === "admin_central" || role === "admin_empresa";

  const monthOptions = useMemo(() => listMonthOptions(), []);
  const [mes, setMes] = useState<string>(getLastClosedMonth());
  const [data, setData] = useState<IndiceData[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [page, setPage] = useState(1);

  const feedRef = useRef<HTMLDivElement>(null);
  const storyRef = useRef<HTMLDivElement>(null);
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(0.5);

  const fetchAll = async () => {
    setLoading(true);
    const { data: rows, error } = await supabase.rpc("list_indice_startgi", { p_limit: 60 });
    if (error) {
      toast.error("Erro ao carregar índice", { description: error.message });
    } else {
      setData((rows ?? []) as any);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // Escala do preview responsivo
  useEffect(() => {
    const calc = () => {
      const w = previewWrapRef.current?.clientWidth ?? 540;
      setPreviewScale(Math.min(1, w / 1080));
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  const selected = useMemo(
    () => data.find((d) => d.mes_referencia === mes),
    [data, mes]
  );

  // Cobertura real de contratos do mês (fila diária de ingestão)
  const [cobertura, setCobertura] = useState<{
    dias_total: number; dias_ok: number; dias_pendentes: number;
    pct_cobertura: number; contratos_mes: number; confiavel: boolean;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: cov } = await (supabase as any).rpc("indice_cobertura_mes", { p_mes: mes });
      if (alive) setCobertura((cov as any)?.[0] ?? null);
    })();
    return () => { alive = false; };
  }, [mes]);

  const handleGerar = async () => {
    setGenerating(true);
    const { data: row, error } = await supabase.rpc("compute_indice_startgi", {
      p_mes: mes, p_force: true,
    });
    setGenerating(false);
    if (error) {
      toast.error("Falha ao gerar índice", { description: error.message });
      return;
    }
    if (cobertura && !cobertura.confiavel) {
      toast.warning("Mês com ingestão incompleta", {
        description: `Cobertura de ${cobertura.pct_cobertura}% dos dias — o valor tende a subir conforme a ingestão avança.`,
      });
    } else {
      toast.success("Índice atualizado", { description: mesLabel(mes) });
    }
    setData((prev) => {
      const r = row as any as IndiceData;
      const idx = prev.findIndex((p) => p.mes_referencia === r.mes_referencia);
      if (idx === -1) return [r, ...prev].sort((a, b) => b.mes_referencia.localeCompare(a.mes_referencia));
      const next = [...prev]; next[idx] = r; return next;
    });
  };


  const exportPng = async (variant: "feed" | "story") => {
    const node = (variant === "feed" ? feedRef : storyRef).current;
    if (!node) return;
    try {
      const canvas = await html2canvas(node, {
        backgroundColor: null, scale: 1, useCORS: true, logging: false,
        width: 1080, height: variant === "feed" ? 1080 : 1920,
      });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `indice-startgi-${mes}-${variant}.png`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e: any) {
      toast.error("Erro ao exportar PNG", { description: e?.message });
    }
  };

  const copyText = async () => {
    if (!selected) return toast.error("Gere o índice antes de copiar o texto.");
    try {
      await navigator.clipboard.writeText(buildPostText(selected));
      toast.success("Texto copiado para a área de transferência.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  // Histórico ordenado desc
  const historico = useMemo(
    () => [...data].sort((a, b) => b.mes_referencia.localeCompare(a.mes_referencia)),
    [data]
  );
  const totalPages = Math.max(1, Math.ceil(historico.length / PAGE_SIZE));
  const pageRows = historico.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Últimos 12 meses fechados disponíveis (com índice)
  const chartData = useMemo(() => {
    const asc = [...data]
      .filter((d) => d.indice_startgi != null)
      .sort((a, b) => a.mes_referencia.localeCompare(b.mes_referencia));
    const last12 = asc.slice(-12);
    return last12.map((d) => ({
      mes: mesAbrev(d.mes_referencia),
      key: d.mes_referencia,
      indice: Number(d.indice_startgi),
      var: Number(d.variacao_mom ?? 0),
    }));
  }, [data]);

  const yMin = useMemo(() => {
    if (!chartData.length) return 80;
    const min = Math.min(...chartData.map((c) => c.indice));
    return Math.max(0, Math.floor(min * 0.8));
  }, [chartData]);

  // Resumo anual
  const resumo = useMemo(() => {
    const year = new Date().getFullYear();
    const ytd = data.filter((d) => d.mes_referencia.startsWith(`${year}-`));
    const maior = ytd.reduce<IndiceData | null>(
      (acc, d) => (d.indice_startgi != null && (!acc || (d.indice_startgi ?? 0) > (acc.indice_startgi ?? 0)) ? d : acc),
      null,
    );
    const jan = ytd.find((d) => d.mes_referencia === `${year}-01`);
    const ultimo = [...ytd].sort((a, b) => b.mes_referencia.localeCompare(a.mes_referencia))[0];
    const crescimento =
      jan?.indice_startgi && ultimo?.indice_startgi
        ? ((ultimo.indice_startgi - jan.indice_startgi) / jan.indice_startgi) * 100
        : null;
    const total = ytd.reduce((s, d) => s + Number(d.valor_total_brl || 0), 0);
    return { maior, crescimento, total, year };
  }, [data]);

  const exportCsv = () => {
    const header = ["Mes","Indice","Var.Mensal(%)","Var.Anual(%)","ValorTotal(BRL)","Contratos","DadosParciais"];
    const lines = historico.map((d) => [
      d.mes_referencia, d.indice_startgi ?? "", d.variacao_mom ?? "", d.variacao_yoy ?? "",
      d.valor_total_brl ?? 0, d.volume_contratos ?? 0, d.dados_parciais ? "sim" : "nao",
    ].join(";"));
    const blob = new Blob([[header.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `indice-startgi-historico.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (!allowed) {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <Card>
          <CardHeader><CardTitle>Acesso restrito</CardTitle></CardHeader>
          <CardContent className="text-muted-foreground">
            Esta página está disponível apenas para administradores.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold">Índice StartGi</h1>
        <p className="text-muted-foreground">
          Consolidação mensal de compras governamentais (PNCP) e exportação do card oficial.
        </p>
      </div>

      {/* Seção 1 — Controles */}
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Mês de referência</label>
            <Select value={mes} onValueChange={(v) => { setMes(v); setPage(1); }}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-80">
                {monthOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGerar} disabled={generating}>
            <RefreshCw className={`h-4 w-4 mr-2 ${generating ? "animate-spin" : ""}`} />
            {generating ? "Gerando..." : "Gerar índice"}
          </Button>
          {selected && (
            <div className="text-sm text-muted-foreground ml-auto flex flex-col items-end">
              <span>
                Atualizado em:{" "}
                {new Date(selected.ultima_atualizacao).toLocaleString("pt-BR", {
                  day: "2-digit", month: "2-digit", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </span>
              {selected.dados_parciais && (
                <Badge variant="outline" className="mt-1 text-amber-600 border-amber-300">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Dados parciais — fechamento dia 10 de {nextMonthName(selected.mes_referencia)}
                </Badge>
              )}
            </div>
          )}
          {cobertura && (
            <div className="w-full">
              {cobertura.confiavel ? (
                <p className="text-xs text-muted-foreground">
                  Cobertura de ingestão do mês: 100% dos dias ({cobertura.contratos_mes.toLocaleString("pt-BR")} contratos).
                </p>
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    <strong>Mês ainda incompleto na base.</strong>{" "}
                    {cobertura.pct_cobertura}% dos dias ingeridos ({cobertura.dias_ok}/{cobertura.dias_total}) —
                    {" "}{cobertura.contratos_mes.toLocaleString("pt-BR")} contratos até agora. O índice gerado agora
                    ficará subestimado; aguarde a fila de ingestão concluir os {cobertura.dias_pendentes} dia(s) restantes.
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>


      {/* Seção 2 — Preview e Exportação */}
      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <Card>
          <CardHeader><CardTitle>Preview do card</CardTitle></CardHeader>
          <CardContent>
            <div
              ref={previewWrapRef}
              className="w-full overflow-hidden rounded-lg border border-border bg-slate-950"
              style={{ height: selected ? 1080 * previewScale : undefined }}
            >
              {selected ? (
                <div
                  style={{
                    width: 1080,
                    height: 1080,
                    transform: `scale(${previewScale})`,
                    transformOrigin: "top left",
                  }}
                >
                  <IndiceStartGiCard data={selected} variant="feed" />
                </div>
              ) : (
                <div className="aspect-square flex items-center justify-center text-muted-foreground p-12 text-center">
                  Selecione um mês e clique em "Gerar índice" para visualizar o card.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Exportar</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full" disabled={!selected} onClick={() => exportPng("feed")}>
              <Download className="h-4 w-4 mr-2" /> Exportar Card Feed (PNG)
            </Button>
            <Button className="w-full" variant="secondary" disabled={!selected} onClick={() => exportPng("story")}>
              <Download className="h-4 w-4 mr-2" /> Exportar Card Story (PNG)
            </Button>
            <Button className="w-full" variant="outline" disabled={!selected} onClick={copyText}>
              <Copy className="h-4 w-4 mr-2" /> Copiar texto do post
            </Button>
            <p className="text-xs text-muted-foreground pt-2">
              O card é renderizado em 1080px e exportado em alta resolução para
              publicação em feed (1080×1080) ou story (1080×1920).
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Seção 3 — Resumo anual */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-medium">Maior índice de {resumo.year}</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-display">
              {formatNum(resumo.maior?.indice_startgi ?? null)}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {resumo.maior ? mesLabel(resumo.maior.mes_referencia) : "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-medium">Crescimento acumulado {resumo.year}</CardTitle></CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold font-display ${resumo.crescimento != null && resumo.crescimento >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {formatPct(resumo.crescimento)}
            </div>
            <div className="text-sm text-muted-foreground mt-1">Jan/{resumo.year} → último fechado</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-medium">Total contratado {resumo.year}</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-display">{formatBRL(resumo.total)}</div>
            <div className="text-sm text-muted-foreground mt-1">soma dos meses do ano corrente</div>
          </CardContent>
        </Card>
      </div>

      {/* Seção 4 — Gráfico */}
      <Card>
        <CardHeader><CardTitle>Evolução do Índice (últimos 12 meses)</CardTitle></CardHeader>
        <CardContent className="h-[360px]">
          {chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              Sem dados suficientes para o gráfico.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="indiceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis domain={[yMin, "auto"]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  formatter={(value: any, name: any) => {
                    if (name === "indice") return [`${formatNum(value)}`, "Índice"];
                    return [value, name];
                  }}
                  labelFormatter={(label, payload) => {
                    const v = payload?.[0]?.payload?.var;
                    return `${label} · Variação ${formatPct(v)}`;
                  }}
                />
                <ReferenceLine y={100} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4"
                  label={{ value: "Base Jan/24", position: "insideTopRight", fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <Area type="monotone" dataKey="indice" stroke="none" fill="url(#indiceGrad)" />
                <Line
                  type="monotone" dataKey="indice"
                  stroke="hsl(var(--primary))" strokeWidth={2.5}
                  dot={(props: any) => {
                    const active = props.payload?.key === mes;
                    return active
                      ? <Dot {...props} r={6} fill="hsl(var(--primary))" stroke="white" strokeWidth={2} />
                      : <Dot {...props} r={3} fill="hsl(var(--primary))" />;
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Seção 5 — Tabela histórica */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Histórico</CardTitle>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <FileDown className="h-4 w-4 mr-2" /> Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês/Ano</TableHead>
                  <TableHead className="text-right">Índice</TableHead>
                  <TableHead className="text-right">Var. Mensal</TableHead>
                  <TableHead className="text-right">Var. Anual</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                  <TableHead className="text-right">Contratos</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                )}
                {!loading && pageRows.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum registro.</TableCell></TableRow>
                )}
                {pageRows.map((d) => {
                  const isSel = d.mes_referencia === mes;
                  const cMom = (d.variacao_mom ?? 0) >= 0 ? "text-emerald-600" : "text-red-600";
                  const cYoy = (d.variacao_yoy ?? 0) >= 0 ? "text-emerald-600" : "text-red-600";
                  return (
                    <TableRow key={d.mes_referencia} className={isSel ? "bg-primary/5" : ""}>
                      <TableCell className="font-medium">
                        {mesLabel(d.mes_referencia)}
                        {d.dados_parciais && (
                          <Badge variant="outline" className="ml-2 text-amber-600 border-amber-300">parcial</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatNum(d.indice_startgi)}</TableCell>
                      <TableCell className={`text-right font-mono ${d.variacao_mom != null ? cMom : ""}`}>
                        <span className="inline-flex items-center gap-1 justify-end">
                          {d.variacao_mom != null && (d.variacao_mom >= 0 ? <TrendingUp className="h-3.5 w-3.5"/> : <TrendingDown className="h-3.5 w-3.5"/>)}
                          {formatPct(d.variacao_mom)}
                        </span>
                      </TableCell>
                      <TableCell className={`text-right font-mono ${d.variacao_yoy != null ? cYoy : ""}`}>
                        {formatPct(d.variacao_yoy)}
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatBRL(d.valor_total_brl)}</TableCell>
                      <TableCell className="text-right font-mono">{(d.volume_contratos ?? 0).toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setMes(d.mes_referencia)}>Selecionar</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cards off-screen para exportação */}
      <div style={{ position: "fixed", top: -100000, left: -100000, pointerEvents: "none" }}>
        {selected && (
          <>
            <div ref={feedRef}><IndiceStartGiCard data={selected} variant="feed" /></div>
            <div ref={storyRef}><IndiceStartGiCard data={selected} variant="story" /></div>
          </>
        )}
      </div>
    </div>
  );
}
