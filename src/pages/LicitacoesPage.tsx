import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Filter, Calendar, RefreshCw, Loader2, Database, ChevronLeft, ChevronRight, X, Trophy, ExternalLink, ChevronDown } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

const PAGE_SIZE = 20;

// All PNCP modalidade codes
const MODALIDADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const MODALIDADE_NAMES: Record<number, string> = {
  1: "Leilão",
  2: "Diálogo Competitivo",
  3: "Concurso",
  4: "Concorrência",
  5: "Pregão",
  6: "Dispensa",
  7: "Inexigibilidade",
  8: "Pregão Presencial",
  9: "Concorrência Presencial",
  10: "Manifestação Interesse",
  11: "Pré-qualificação",
  12: "Credenciamento",
  13: "Outros",
};

function formatCurrency(value: number | null) {
  if (!value) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function StatusBadge({ situacao }: { situacao: string | null }) {
  if (!situacao) return <span className="text-muted-foreground text-xs">—</span>;
  const normalized = situacao.toLowerCase();
  const color = normalized.includes("homologad") || normalized.includes("conclu")
    ? "bg-success/10 text-success"
    : normalized.includes("andamento") || normalized.includes("abert")
    ? "bg-warning/10 text-warning"
    : "bg-info/10 text-info";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {situacao}
    </span>
  );
}

function generateMonthlyChunks(startDate: string, endDate: string) {
  const chunks: { dataInicial: string; dataFinal: string }[] = [];
  const start = new Date(
    parseInt(startDate.slice(0, 4)),
    parseInt(startDate.slice(4, 6)) - 1,
    parseInt(startDate.slice(6, 8))
  );
  const end = new Date(
    parseInt(endDate.slice(0, 4)),
    parseInt(endDate.slice(4, 6)) - 1,
    parseInt(endDate.slice(6, 8))
  );

  let cursor = new Date(start);
  while (cursor <= end) {
    const chunkStart = new Date(cursor);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const chunkEnd = monthEnd > end ? end : monthEnd;

    const fmt = (d: Date) =>
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

    chunks.push({ dataInicial: fmt(chunkStart), dataFinal: fmt(chunkEnd) });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return chunks;
}

interface IngestProgress {
  totalProcessed: number;
  currentChunk: string;
  currentModalidade: string;
  currentPage: number;
  isRunning: boolean;
  phase: "ingest" | "winners";
  winnersFound?: number;
}

export default function LicitacoesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const abortRef = useRef(false);
  const queryClient = useQueryClient();

  const [filterModalidade, setFilterModalidade] = useState<string>("");
  const [filterUf, setFilterUf] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [showFilters, setShowFilters] = useState(false);

  const activeFilterCount = [filterModalidade, filterUf, dateFrom, dateTo].filter(Boolean).length;

  const buildQuery = (base: any) => {
    let q = base;
    if (searchTerm.trim()) {
      q = q.or(`objeto.ilike.%${searchTerm}%,orgao.ilike.%${searchTerm}%`);
    }
    if (filterModalidade) {
      q = q.eq("modalidade", filterModalidade);
    }
    if (filterUf) {
      q = q.eq("uf", filterUf);
    }
    if (dateFrom) {
      q = q.gte("data_publicacao", format(dateFrom, "yyyy-MM-dd"));
    }
    if (dateTo) {
      q = q.lte("data_publicacao", format(dateTo, "yyyy-MM-dd"));
    }
    return q;
  };

  const { data: totalCount } = useQuery({
    queryKey: ["licitacoes-count", searchTerm, filterModalidade, filterUf, dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from("licitacoes")
        .select("*", { count: "exact", head: true });
      query = buildQuery(query);
      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: licitacoes, isLoading } = useQuery({
    queryKey: ["licitacoes", searchTerm, page, filterModalidade, filterUf, dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let query = supabase
        .from("licitacoes")
        .select(`
          *,
          licitacao_itens (
            id,
            licitacao_vencedores (
              razao_social
            )
          )
        `)
        .order("data_publicacao", { ascending: false })
        .range(from, to);
      query = buildQuery(query);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const startBulkIngestion = useCallback(async () => {
    abortRef.current = false;
    const today = new Date();
    const endDate = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    const chunks = generateMonthlyChunks("20230101", endDate);
    let grandTotal = 0;

    setProgress({
      totalProcessed: 0,
      currentChunk: "",
      currentModalidade: "",
      currentPage: 1,
      isRunning: true,
      phase: "ingest",
    });

    // Phase 1: Fast bulk ingestion (no winner fetching)
    for (const chunk of chunks) {
      if (abortRef.current) break;

      for (const modalidade of MODALIDADES) {
        if (abortRef.current) break;

        let pagina = 1;
        let hasMore = true;
        let consecutiveErrors = 0;

        while (hasMore && !abortRef.current && consecutiveErrors < 3) {
          const chunkLabel = `${chunk.dataInicial.slice(0, 4)}-${chunk.dataInicial.slice(4, 6)}`;
          setProgress({
            totalProcessed: grandTotal,
            currentChunk: chunkLabel,
            currentModalidade: MODALIDADE_NAMES[modalidade] || String(modalidade),
            currentPage: pagina,
            isRunning: true,
            phase: "ingest",
          });

          try {
            const { data, error } = await supabase.functions.invoke("ingest-pncp", {
              body: {
                dataInicial: chunk.dataInicial,
                dataFinal: chunk.dataFinal,
                modalidade,
                pagina,
              },
            });

            if (error) {
              console.warn(`Error chunk ${chunkLabel} mod ${modalidade} pag ${pagina}:`, error);
              consecutiveErrors++;
              if (consecutiveErrors >= 3) {
                hasMore = false;
              } else {
                // Wait before retry
                await new Promise((r) => setTimeout(r, 1000));
                continue;
              }
            } else {
              consecutiveErrors = 0;
              grandTotal += data?.totalProcessed || 0;
              hasMore = data?.hasMore || false;
              pagina++;
            }

            // Refresh table periodically
            if (grandTotal % 500 < 50) {
              queryClient.invalidateQueries({ queryKey: ["licitacoes"] });
              queryClient.invalidateQueries({ queryKey: ["licitacoes-count"] });
            }
          } catch (err) {
            console.warn(`Exception:`, err);
            consecutiveErrors++;
            if (consecutiveErrors >= 3) hasMore = false;
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }
    }

    setProgress((p) => (p ? { ...p, isRunning: false } : null));
    queryClient.invalidateQueries({ queryKey: ["licitacoes"] });
    queryClient.invalidateQueries({ queryKey: ["licitacoes-count"] });
    toast.success(`Ingestão concluída! ${grandTotal.toLocaleString("pt-BR")} registros processados.`);
  }, [queryClient]);

  const startWinnerFetching = useCallback(async () => {
    abortRef.current = false;
    let totalWinners = 0;
    let totalProcessed = 0;
    let hasMore = true;

    setProgress({
      totalProcessed: 0,
      currentChunk: "",
      currentModalidade: "",
      currentPage: 0,
      isRunning: true,
      phase: "winners",
      winnersFound: 0,
    });

    while (hasMore && !abortRef.current) {
      try {
        const { data, error } = await supabase.functions.invoke("ingest-pncp", {
          body: { mode: "winners", limit: 30 },
        });

        if (error) {
          console.warn("Winner fetch error:", error);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        totalWinners += data?.winnersFound || 0;
        totalProcessed += data?.processed || 0;
        hasMore = data?.hasMore || false;

        setProgress({
          totalProcessed,
          currentChunk: "",
          currentModalidade: "",
          currentPage: 0,
          isRunning: true,
          phase: "winners",
          winnersFound: totalWinners,
        });

        // Refresh table periodically
        if (totalProcessed % 100 < 30) {
          queryClient.invalidateQueries({ queryKey: ["licitacoes"] });
        }
      } catch (err) {
        console.warn("Winner exception:", err);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    setProgress((p) => (p ? { ...p, isRunning: false } : null));
    queryClient.invalidateQueries({ queryKey: ["licitacoes"] });
    toast.success(`Vencedores: ${totalWinners.toLocaleString("pt-BR")} encontrados em ${totalProcessed.toLocaleString("pt-BR")} licitações.`);
  }, [queryClient]);

  const cancelIngestion = () => {
    abortRef.current = true;
    toast.info("Cancelando...");
  };

  const total = totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function getVencedor(row: any): string {
    const itens = row.licitacao_itens;
    if (!itens || !Array.isArray(itens)) return "—";
    for (const item of itens) {
      const vencedores = item.licitacao_vencedores;
      if (vencedores && Array.isArray(vencedores) && vencedores.length > 0) {
        return vencedores[0].razao_social || "—";
      }
    }
    return "—";
  }

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setPage(0);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Licitações</h1>
          <p className="text-sm text-muted-foreground">
            {total > 0
              ? `${total.toLocaleString("pt-BR")} registros do PNCP`
              : "Dados ingeridos do PNCP e Portal da Transparência"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {progress?.isRunning && (
            <button
              onClick={cancelIngestion}
              className="flex h-10 items-center gap-2 rounded-lg border border-destructive px-4 text-sm font-medium text-destructive hover:bg-destructive/10 transition"
            >
              <X className="h-4 w-4" />
              Cancelar
            </button>
          )}
          <button
            onClick={startWinnerFetching}
            disabled={progress?.isRunning}
            className="flex h-10 items-center gap-2 rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground hover:bg-secondary transition disabled:opacity-50"
          >
            {progress?.isRunning && progress.phase === "winners" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trophy className="h-4 w-4" />
            )}
            Buscar Vencedores
          </button>
          <button
            onClick={startBulkIngestion}
            disabled={progress?.isRunning}
            className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:opacity-90 transition disabled:opacity-50"
          >
            {progress?.isRunning && progress.phase === "ingest" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {progress?.isRunning && progress.phase === "ingest" ? "Ingerindo..." : "Ingerir PNCP (2023–Hoje)"}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {progress && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border bg-card p-4 space-y-2"
        >
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">
              {progress.isRunning
                ? progress.phase === "ingest"
                  ? "Ingestão em andamento..."
                  : "Buscando vencedores..."
                : progress.phase === "ingest"
                ? "Ingestão concluída"
                : "Busca de vencedores concluída"}
            </span>
            <span className="font-mono text-primary font-bold">
              {progress.phase === "winners"
                ? `${(progress.winnersFound || 0).toLocaleString("pt-BR")} vencedores / ${progress.totalProcessed.toLocaleString("pt-BR")} processados`
                : `${progress.totalProcessed.toLocaleString("pt-BR")} registros`}
            </span>
          </div>
          {progress.isRunning && progress.phase === "ingest" && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Período: {progress.currentChunk}</span>
              <span>Modalidade: {progress.currentModalidade}</span>
              <span>Página: {progress.currentPage}</span>
            </div>
          )}
          {progress.isRunning && (
            <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-primary"
                animate={{ width: ["0%", "100%"] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              />
            </div>
          )}
        </motion.div>
      )}

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Buscar por objeto, órgão..."
              className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition",
              showFilters || activeFilterCount > 0
                ? "border-primary bg-primary/10 text-primary"
                : "border-input bg-card text-muted-foreground hover:bg-secondary"
            )}
          >
            <Filter className="h-4 w-4" />
            Filtros
            {activeFilterCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showFilters && "rotate-180")} />
          </button>
          {activeFilterCount > 0 && (
            <button
              onClick={() => {
                setFilterModalidade("");
                setFilterUf("");
                setDateFrom(undefined);
                setDateTo(undefined);
                setPage(0);
              }}
              className="flex h-10 items-center gap-1.5 rounded-lg border border-destructive/30 px-3 text-sm text-destructive hover:bg-destructive/10 transition"
            >
              <X className="h-3.5 w-3.5" />
              Limpar filtros
            </button>
          )}
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4">
                {/* Modalidade */}
                <div className="space-y-1.5 min-w-[180px]">
                  <label className="text-xs font-medium text-muted-foreground">Modalidade</label>
                  <select
                    value={filterModalidade}
                    onChange={(e) => { setFilterModalidade(e.target.value); setPage(0); }}
                    className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Todas</option>
                    <option value="Pregão - Eletrônico">Pregão - Eletrônico</option>
                    <option value="Pregão - Presencial">Pregão - Presencial</option>
                    <option value="Concorrência - Eletrônica">Concorrência - Eletrônica</option>
                    <option value="Concorrência - Presencial">Concorrência - Presencial</option>
                    <option value="Dispensa">Dispensa</option>
                    <option value="Inexigibilidade">Inexigibilidade</option>
                    <option value="Credenciamento">Credenciamento</option>
                    <option value="Leilão - Eletrônico">Leilão - Eletrônico</option>
                    <option value="Leilão - Presencial">Leilão - Presencial</option>
                    <option value="Concurso">Concurso</option>
                    <option value="Manifestação de Interesse">Manifestação de Interesse</option>
                    <option value="Pré-qualificação">Pré-qualificação</option>
                  </select>
                </div>

                {/* UF */}
                <div className="space-y-1.5 min-w-[120px]">
                  <label className="text-xs font-medium text-muted-foreground">UF</label>
                  <select
                    value={filterUf}
                    onChange={(e) => { setFilterUf(e.target.value); setPage(0); }}
                    className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Todas</option>
                    {["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"].map(uf => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                  </select>
                </div>

                {/* Date From */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Data inicial</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className={cn(
                        "flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm",
                        !dateFrom && "text-muted-foreground"
                      )}>
                        <Calendar className="h-3.5 w-3.5" />
                        {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Selecionar"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={dateFrom}
                        onSelect={(d) => { setDateFrom(d); setPage(0); }}
                        locale={ptBR}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Date To */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Data final</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className={cn(
                        "flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm",
                        !dateTo && "text-muted-foreground"
                      )}>
                        <Calendar className="h-3.5 w-3.5" />
                        {dateTo ? format(dateTo, "dd/MM/yyyy") : "Selecionar"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={dateTo}
                        onSelect={(d) => { setDateTo(d); setPage(0); }}
                        locale={ptBR}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : total === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Database className="h-8 w-8 text-primary" />
          </div>
          <h2 className="mt-4 font-display text-lg font-semibold text-foreground">Nenhuma licitação encontrada</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md text-center">
            Clique em "Ingerir PNCP" para buscar dados reais de licitações do Portal Nacional de Contratações Públicas.
          </p>
        </motion.div>
      ) : (
        <>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Órgão</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Objeto</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Modalidade</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Valor Est.</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Vencedor</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Data</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">UF</th>
                  </tr>
                </thead>
                <tbody>
                  {licitacoes?.map((row) => {
                    // numero_controle_pncp format: "CNPJ-X-SEQ/ANO" e.g. "00394452000103-1-001857/2023"
                    let pncpLink: string | null = null;
                    if (row.numero_controle_pncp) {
                      const match = row.numero_controle_pncp.match(/^(\d+)-\d+-(\d+)\/(\d+)$/);
                      if (match) {
                        pncpLink = `https://pncp.gov.br/app/editais/${match[1]}/${match[3]}/${parseInt(match[2])}`;
                      }
                    }
                    return (
                      <tr key={row.id} className="border-b border-border last:border-0 transition hover:bg-secondary/30">
                        <td className="px-4 py-3 font-medium text-foreground max-w-[220px] truncate">
                          {pncpLink ? (
                            <a href={pncpLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                              {row.orgao}
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                          ) : row.orgao}
                        </td>
                        <td className="px-4 py-3 max-w-xs truncate text-foreground">{row.objeto}</td>
                        <td className="px-4 py-3 text-muted-foreground">{row.modalidade || "—"}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{formatCurrency(row.valor_estimado)}</td>
                        <td className="px-4 py-3 text-foreground max-w-[180px] truncate">{getVencedor(row)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{row.data_publicacao || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{row.uf || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total.toLocaleString("pt-BR")}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-input bg-card text-muted-foreground hover:bg-secondary disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium text-foreground">
                {page + 1} / {totalPages.toLocaleString("pt-BR")}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-input bg-card text-muted-foreground hover:bg-secondary disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
