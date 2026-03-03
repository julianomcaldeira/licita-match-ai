import { useState, useCallback, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, Calendar, RefreshCw, Loader2, Database, ChevronLeft, ChevronRight, X, Trophy, ExternalLink, ChevronDown, FileSpreadsheet, Building2, User, Eye, Package, Award, FileText, MapPin, Hash, DollarSign, Clock, Brain, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import * as XLSX from "xlsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

const PAGE_SIZE = 20;

const MODALIDADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const MODALIDADE_NAMES: Record<number, string> = {
  1: "Leilão", 2: "Diálogo Competitivo", 3: "Concurso", 4: "Concorrência",
  5: "Pregão", 6: "Dispensa", 7: "Inexigibilidade", 8: "Pregão Presencial",
  9: "Concorrência Presencial", 10: "Manifestação Interesse", 11: "Pré-qualificação",
  12: "Credenciamento", 13: "Outros",
};

function formatCurrency(value: number | null) {
  if (!value) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function StatusBadge({ situacao, hasWinner }: { situacao: string | null; hasWinner?: boolean }) {
  if (!situacao && !hasWinner) return <span className="text-muted-foreground text-xs">—</span>;
  const displayStatus = hasWinner ? "Com Resultado (Homologada)" : situacao;
  const normalized = (displayStatus || "").toLowerCase();
  const color = hasWinner || normalized.includes("homologad") || normalized.includes("conclu") || normalized.includes("resultado")
    ? "bg-success/10 text-success border-success/20"
    : normalized.includes("andamento") || normalized.includes("abert") || normalized.includes("divulgada")
    ? "bg-info/10 text-info border-info/20"
    : normalized.includes("revogad") || normalized.includes("anulad") || normalized.includes("suspens")
    ? "bg-destructive/10 text-destructive border-destructive/20"
    : "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {displayStatus || "—"}
    </span>
  );
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function generateMonthlyChunks(startDate: string, endDate: string) {
  const chunks: { dataInicial: string; dataFinal: string }[] = [];
  const start = new Date(parseInt(startDate.slice(0, 4)), parseInt(startDate.slice(4, 6)) - 1, parseInt(startDate.slice(6, 8)));
  const end = new Date(parseInt(endDate.slice(0, 4)), parseInt(endDate.slice(4, 6)) - 1, parseInt(endDate.slice(6, 8)));
  let cursor = new Date(start);
  while (cursor <= end) {
    const chunkStart = new Date(cursor);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const chunkEnd = monthEnd > end ? end : monthEnd;
    const fmt = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
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
  const [filterSituacao, setFilterSituacao] = useState<string>("");
  const [filterOrgao, setFilterOrgao] = useState<string>("");
  const [filterVencedor, setFilterVencedor] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(new Date(new Date().getFullYear(), 0, 1));
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [comVencedor, setComVencedor] = useState(true);

  // Detail modal state
  const [selectedLicitacao, setSelectedLicitacao] = useState<any | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailItems, setDetailItems] = useState<any[]>([]);
  const [detailWinners, setDetailWinners] = useState<any[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const openDetail = async (row: any) => {
    setSelectedLicitacao(row);
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailItems([]);
    setDetailWinners([]);
    setAiAnalysis(null);
    setAiLoading(false);
    try {
      const [itemsRes, fullRes] = await Promise.all([
        supabase.from("licitacao_itens").select("*, licitacao_vencedores(*)").eq("licitacao_id", row.id).order("numero_item"),
        supabase.from("licitacoes").select("*").eq("id", row.id).single(),
      ]);
      if (itemsRes.data) {
        setDetailItems(itemsRes.data);
        const winners = itemsRes.data.flatMap((item: any) => {
          const venc = item.licitacao_vencedores;
          if (!venc) return [];
          const arr = Array.isArray(venc) ? venc : [venc];
          return arr.map((v: any) => ({ ...v, item_descricao: item.descricao, numero_item: item.numero_item }));
        });
        setDetailWinners(winners);
      }
      if (fullRes.data) {
        setSelectedLicitacao((prev: any) => ({ ...prev, ...fullRes.data }));
      }
    } catch (e) {
      console.error("Error fetching detail:", e);
    } finally {
      setDetailLoading(false);
    }
  };

  const runAiAnalysis = async (objeto: string, items: any[]) => {
    setAiLoading(true);
    setAiAnalysis(null);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-objeto", {
        body: { objeto, itens: items.map(i => ({ numero_item: i.numero_item, descricao: i.descricao, quantidade: i.quantidade, unidade: i.unidade, valor_unitario_estimado: i.valor_unitario_estimado })) },
      });
      if (error) throw error;
      setAiAnalysis(data.analysis || data.error || "Erro na análise.");
    } catch (e: any) {
      console.error("AI analysis error:", e);
      setAiAnalysis("Não foi possível gerar a análise. Tente novamente.");
    } finally {
      setAiLoading(false);
    }
  };

  const debouncedSearch = useDebounce(searchTerm, 400);
  const debouncedOrgao = useDebounce(filterOrgao, 400);
  const debouncedVencedor = useDebounce(filterVencedor, 400);

  const defaultDateFrom = new Date(new Date().getFullYear(), 0, 1);
  const hasNonDefaultDateFrom = dateFrom && dateFrom.getTime() !== defaultDateFrom.getTime();
  const activeFilterCount = [filterModalidade, filterUf, filterSituacao, debouncedOrgao, debouncedVencedor, hasNonDefaultDateFrom ? dateFrom : null, dateTo, !comVencedor ? "no-vencedor" : null].filter(Boolean).length;

  const { data: situacoes } = useQuery({
    queryKey: ["situacoes-distintas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_distinct_situacoes");
      if (error) { console.warn("Situacoes error:", error); return []; }
      return data as { situacao: string; count: number }[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: queryResult, isLoading } = useQuery({
    queryKey: ["licitacoes-rpc", debouncedSearch, page, filterModalidade, filterUf, filterSituacao, debouncedOrgao, debouncedVencedor, dateFrom?.toISOString(), dateTo?.toISOString(), comVencedor],
    queryFn: async () => {
      const params: any = {
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
        p_com_vencedor: comVencedor,
      };
      if (debouncedSearch.trim()) params.p_search = debouncedSearch.trim();
      if (filterModalidade) params.p_modalidade = filterModalidade;
      if (filterUf) params.p_uf = filterUf;
      if (filterSituacao) params.p_situacao = filterSituacao;
      if (debouncedOrgao.trim()) params.p_orgao = debouncedOrgao.trim();
      if (debouncedVencedor.trim()) params.p_vencedor = debouncedVencedor.trim();
      if (dateFrom) params.p_date_from = format(dateFrom, "yyyy-MM-dd");
      if (dateTo) params.p_date_to = format(dateTo, "yyyy-MM-dd");

      const { data, error } = await (supabase as any).rpc("search_licitacoes", params);
      if (error) throw error;
      return data as any[];
    },
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  const licitacoes = queryResult || [];
  const totalCount = licitacoes.length > 0 ? Number(licitacoes[0].total_count) : 0;
  const hasData = licitacoes.length > 0;
  const total = totalCount;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // --- Ingestion callbacks ---
  const startBulkIngestion = useCallback(async () => {
    abortRef.current = false;
    const today = new Date();
    const endDate = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    const chunks = generateMonthlyChunks("20230101", endDate);
    let grandTotal = 0;
    setProgress({ totalProcessed: 0, currentChunk: "", currentModalidade: "", currentPage: 1, isRunning: true, phase: "ingest" });

    for (const chunk of chunks) {
      if (abortRef.current) break;
      for (const modalidade of MODALIDADES) {
        if (abortRef.current) break;
        let pagina = 1, hasMore = true, consecutiveErrors = 0;
        while (hasMore && !abortRef.current && consecutiveErrors < 3) {
          const chunkLabel = `${chunk.dataInicial.slice(0, 4)}-${chunk.dataInicial.slice(4, 6)}`;
          setProgress({ totalProcessed: grandTotal, currentChunk: chunkLabel, currentModalidade: MODALIDADE_NAMES[modalidade] || String(modalidade), currentPage: pagina, isRunning: true, phase: "ingest" });
          try {
            const { data, error } = await supabase.functions.invoke("ingest-pncp", { body: { dataInicial: chunk.dataInicial, dataFinal: chunk.dataFinal, modalidade, pagina } });
            if (error) { consecutiveErrors++; if (consecutiveErrors >= 3) hasMore = false; else await new Promise(r => setTimeout(r, 1000)); continue; }
            consecutiveErrors = 0; grandTotal += data?.totalProcessed || 0; hasMore = data?.hasMore || false; pagina++;
            if (grandTotal % 500 < 50) { queryClient.invalidateQueries({ queryKey: ["licitacoes-rpc"] }); }
          } catch { consecutiveErrors++; if (consecutiveErrors >= 3) hasMore = false; await new Promise(r => setTimeout(r, 1000)); }
        }
      }
    }
    setProgress(p => (p ? { ...p, isRunning: false } : null));
    queryClient.invalidateQueries({ queryKey: ["licitacoes-rpc"] });
    toast.success(`Ingestão concluída! ${grandTotal.toLocaleString("pt-BR")} registros processados.`);
  }, [queryClient]);

  const startWinnerFetching = useCallback(async () => {
    abortRef.current = false;
    let totalWinners = 0, totalProcessed = 0, hasMore = true;
    setProgress({ totalProcessed: 0, currentChunk: "", currentModalidade: "", currentPage: 0, isRunning: true, phase: "winners", winnersFound: 0 });
    while (hasMore && !abortRef.current) {
      try {
        const { data, error } = await supabase.functions.invoke("ingest-pncp", { body: { mode: "winners", limit: 50 } });
        if (error) { await new Promise(r => setTimeout(r, 2000)); continue; }
        totalWinners += data?.winnersFound || 0; totalProcessed += data?.processed || 0; hasMore = data?.hasMore || false;
        setProgress({ totalProcessed, currentChunk: "", currentModalidade: "", currentPage: 0, isRunning: true, phase: "winners", winnersFound: totalWinners });
        if (totalProcessed % 100 < 30) queryClient.invalidateQueries({ queryKey: ["licitacoes-rpc"] });
      } catch { await new Promise(r => setTimeout(r, 2000)); }
    }
    setProgress(p => (p ? { ...p, isRunning: false } : null));
    queryClient.invalidateQueries({ queryKey: ["licitacoes-rpc"] });
    toast.success(`Vencedores: ${totalWinners.toLocaleString("pt-BR")} encontrados em ${totalProcessed.toLocaleString("pt-BR")} licitações.`);
  }, [queryClient]);

  const cancelIngestion = () => { abortRef.current = true; toast.info("Cancelando..."); };

  const handleSearch = (value: string) => { setSearchTerm(value); setPage(0); };

  const [exporting, setExporting] = useState(false);

  const exportToExcel = useCallback(async () => {
    setExporting(true);
    try {
      let allData: any[] = [];
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;
      while (hasMore && allData.length < 10000) {
        const params: any = { p_limit: batchSize, p_offset: offset, p_com_vencedor: comVencedor };
        if (debouncedSearch.trim()) params.p_search = debouncedSearch.trim();
        if (filterModalidade) params.p_modalidade = filterModalidade;
        if (filterUf) params.p_uf = filterUf;
        if (filterSituacao) params.p_situacao = filterSituacao;
        if (debouncedOrgao.trim()) params.p_orgao = debouncedOrgao.trim();
        if (debouncedVencedor.trim()) params.p_vencedor = debouncedVencedor.trim();
        if (dateFrom) params.p_date_from = format(dateFrom, "yyyy-MM-dd");
        if (dateTo) params.p_date_to = format(dateTo, "yyyy-MM-dd");
        const { data, error } = await (supabase as any).rpc("search_licitacoes", params);
        if (error) throw error;
        if (data && data.length > 0) { allData = [...allData, ...data]; offset += batchSize; hasMore = data.length === batchSize; }
        else hasMore = false;
      }
      const rows = allData.map((row: any) => ({
        "Órgão": row.orgao, "Objeto": row.objeto, "Modalidade": row.modalidade || "",
        "Valor Estimado": row.valor_estimado || "", "Val. Homologado": row.valor_homologado || "",
        "Economia": row.valor_estimado && row.valor_homologado ? row.valor_estimado - row.valor_homologado : "",
        "Vencedor": row.vencedor_nome || "—",
        "Data Publicação": row.data_publicacao || "", "UF": row.uf || "",
        "Situação": row.situacao || "", "Município": row.municipio || "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Licitações");
      XLSX.writeFile(wb, `licitacoes_${format(new Date(), "yyyy-MM-dd_HHmm")}.xlsx`);
      toast.success(`${rows.length.toLocaleString("pt-BR")} registros exportados com sucesso!`);
    } catch (err) { console.error("Export error:", err); toast.error("Erro ao exportar dados."); }
    finally { setExporting(false); }
  }, [debouncedSearch, filterModalidade, filterUf, filterSituacao, debouncedOrgao, debouncedVencedor, dateFrom, dateTo, comVencedor]);

  const clearFilters = () => {
    setSearchTerm(""); setFilterModalidade(""); setFilterUf(""); setFilterSituacao("");
    setFilterOrgao(""); setFilterVencedor("");
    setDateFrom(new Date(new Date().getFullYear(), 0, 1)); setDateTo(undefined);
    setComVencedor(true); setPage(0);
  };

  return (
    <div className="space-y-4">
      {/* Header compact */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Licitações</h1>
          <p className="text-sm text-muted-foreground">
            {total > 0
              ? `${total.toLocaleString("pt-BR")} ${comVencedor ? "licitações com resultado" : "registros"} encontrados`
              : "Busque por órgão, objeto, vencedor ou UF"}
          </p>
        </div>
        {/* Ingestion actions in dropdown */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex h-9 items-center gap-2 rounded-lg border border-input bg-card px-3 text-xs font-medium text-muted-foreground hover:bg-secondary transition">
              <Database className="h-3.5 w-3.5" /> Ingestão <ChevronDown className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="end">
            <div className="space-y-1">
              <button onClick={startBulkIngestion} disabled={progress?.isRunning} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-secondary transition disabled:opacity-50">
                {progress?.isRunning && progress.phase === "ingest" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Ingerir PNCP (2023–Hoje)
              </button>
              <button onClick={startWinnerFetching} disabled={progress?.isRunning} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-secondary transition disabled:opacity-50">
                {progress?.isRunning && progress.phase === "winners" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
                Buscar Vencedores
              </button>
              {progress?.isRunning && (
                <button onClick={cancelIngestion} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition">
                  <X className="h-4 w-4" /> Cancelar
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Progress bar */}
      {progress && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-border bg-card p-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">
              {progress.isRunning ? (progress.phase === "ingest" ? "Ingestão em andamento..." : "Buscando vencedores...") : "Concluído"}
            </span>
            <span className="font-mono text-primary font-bold">
              {progress.phase === "winners" ? `${(progress.winnersFound || 0).toLocaleString("pt-BR")} vencedores` : `${progress.totalProcessed.toLocaleString("pt-BR")} registros`}
            </span>
          </div>
          {progress.isRunning && (
            <div className="h-1 w-full rounded-full bg-secondary overflow-hidden">
              <motion.div className="h-full rounded-full bg-primary" animate={{ width: ["0%", "100%"] }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} />
            </div>
          )}
        </motion.div>
      )}

      {/* Search & Filters - Always visible */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        {/* Row 1: Main search bar */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Buscar por objeto ou descrição da licitação..."
            className="h-12 w-full rounded-xl border border-input bg-background pl-12 pr-4 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary transition"
          />
        </div>

        {/* Row 2: Quick filters always visible */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {/* Órgão */}
          <div className="space-y-1 col-span-2 sm:col-span-1 lg:col-span-2">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Building2 className="h-3 w-3" /> Órgão
            </label>
            <input
              value={filterOrgao}
              onChange={(e) => { setFilterOrgao(e.target.value); setPage(0); }}
              placeholder="Ex: Sanasa, UFMG..."
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* UF */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">UF</label>
            <select value={filterUf} onChange={(e) => { setFilterUf(e.target.value); setPage(0); }} className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">Todas</option>
              {["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"].map(uf => (
                <option key={uf} value={uf}>{uf}</option>
              ))}
            </select>
          </div>

          {/* Modalidade */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Modalidade</label>
            <select value={filterModalidade} onChange={(e) => { setFilterModalidade(e.target.value); setPage(0); }} className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">Todas</option>
              <option value="Pregão - Eletrônico">Pregão Eletrônico</option>
              <option value="Concorrência - Eletrônica">Concorrência</option>
              <option value="Dispensa">Dispensa</option>
              <option value="Inexigibilidade">Inexigibilidade</option>
              <option value="Credenciamento">Credenciamento</option>
              <option value="Pregão - Presencial">Pregão Presencial</option>
              <option value="Concorrência - Presencial">Concorrência Presencial</option>
              <option value="Leilão - Eletrônico">Leilão</option>
              <option value="Concurso">Concurso</option>
              <option value="Manifestação de Interesse">Manif. Interesse</option>
              <option value="Pré-qualificação">Pré-qualificação</option>
            </select>
          </div>

          {/* Data Inicial */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">De</label>
            <Popover>
              <PopoverTrigger asChild>
                <button className={cn("flex h-9 w-full items-center gap-1.5 rounded-lg border border-input bg-background px-2 text-sm", !dateFrom && "text-muted-foreground")}>
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  {dateFrom ? format(dateFrom, "dd/MM/yy") : "Início"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent mode="single" selected={dateFrom} onSelect={(d) => { setDateFrom(d); setPage(0); }} locale={ptBR} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          {/* Data Final */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Até</label>
            <Popover>
              <PopoverTrigger asChild>
                <button className={cn("flex h-9 w-full items-center gap-1.5 rounded-lg border border-input bg-background px-2 text-sm", !dateTo && "text-muted-foreground")}>
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  {dateTo ? format(dateTo, "dd/MM/yy") : "Hoje"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent mode="single" selected={dateTo} onSelect={(d) => { setDateTo(d); setPage(0); }} locale={ptBR} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Row 3: Toggle chips + more filters + actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Com Vencedor toggle */}
          <button
            onClick={() => { setComVencedor(!comVencedor); setPage(0); }}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition",
              comVencedor
                ? "border-success/40 bg-success/10 text-success"
                : "border-input bg-background text-muted-foreground hover:bg-secondary"
            )}
          >
            <Trophy className="h-3 w-3" />
            {comVencedor ? "Com Resultado" : "Todas as situações"}
          </button>

          {/* Vencedor filter */}
          {comVencedor && (
            <div className="relative flex items-center">
              <User className="absolute left-2.5 h-3 w-3 text-muted-foreground" />
              <input
                value={filterVencedor}
                onChange={(e) => { setFilterVencedor(e.target.value); setPage(0); }}
                placeholder="Filtrar por vencedor..."
                className="h-8 w-40 rounded-full border border-input bg-background pl-7 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:w-56 transition-all"
              />
            </div>
          )}

          {/* Situação (when not filtering by vencedor) */}
          {!comVencedor && (
            <select value={filterSituacao} onChange={(e) => { setFilterSituacao(e.target.value); setPage(0); }} className="h-8 rounded-full border border-input bg-background px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">Todas situações</option>
              {situacoes?.map(s => (
                <option key={s.situacao} value={s.situacao}>
                  {s.situacao} ({s.count.toLocaleString("pt-BR")})
                </option>
              ))}
            </select>
          )}

          <div className="flex-1" />

          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="flex h-8 items-center gap-1.5 rounded-full border border-destructive/30 px-3 text-xs font-medium text-destructive hover:bg-destructive/10 transition">
              <X className="h-3 w-3" /> Limpar ({activeFilterCount})
            </button>
          )}

          <button onClick={exportToExcel} disabled={exporting || !hasData} className="flex h-8 items-center gap-1.5 rounded-full border border-input bg-background px-3 text-xs font-medium text-muted-foreground hover:bg-secondary transition disabled:opacity-50">
            {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileSpreadsheet className="h-3 w-3" />}
            Excel
          </button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !hasData ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center py-20">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Database className="h-8 w-8 text-primary" />
          </div>
          <h2 className="mt-4 font-display text-lg font-semibold text-foreground">Nenhuma licitação encontrada</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md text-center">
            {activeFilterCount > 0 || debouncedSearch ? "Nenhum resultado para os filtros aplicados. Tente ajustar os critérios." : 'Use o menu "Ingestão" para buscar dados do PNCP.'}
          </p>
        </motion.div>
      ) : (
        <>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                   <tr className="border-b border-border bg-secondary/50">
                     <th className="px-4 py-3 text-left font-medium text-muted-foreground">Ações</th>
                     <th className="px-4 py-3 text-left font-medium text-muted-foreground">Órgão</th>
                     <th className="px-4 py-3 text-left font-medium text-muted-foreground">Objeto</th>
                     <th className="px-4 py-3 text-left font-medium text-muted-foreground">Modalidade</th>
                     <th className="px-4 py-3 text-left font-medium text-muted-foreground">Valor Est.</th>
                     <th className="px-4 py-3 text-left font-medium text-muted-foreground">Val. Homologado</th>
                     <th className="px-4 py-3 text-left font-medium text-muted-foreground">Economia</th>
                     <th className="px-4 py-3 text-left font-medium text-muted-foreground">Vencedor</th>
                     <th className="px-4 py-3 text-left font-medium text-muted-foreground">Data</th>
                     <th className="px-4 py-3 text-left font-medium text-muted-foreground">UF</th>
                   </tr>
                 </thead>
                 <tbody>
                   {licitacoes.map((row: any) => {
                     let pncpLink: string | null = null;
                     if (row.numero_controle_pncp) {
                       const match = row.numero_controle_pncp.match(/^(\d+)-\d+-(\d+)\/(\d+)$/);
                       if (match) pncpLink = `https://pncp.gov.br/app/editais/${match[1]}/${match[3]}/${parseInt(match[2])}`;
                     }
                     const formattedDate = row.data_publicacao
                       ? (() => { const [y, m, d] = row.data_publicacao.split("-"); return `${d}/${m}/${y}`; })()
                       : "—";
                     return (
                       <tr key={row.id} className="border-b border-border last:border-0 transition hover:bg-secondary/30">
                         <td className="px-4 py-3">
                           <button onClick={() => openDetail(row)} className="flex h-8 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 text-xs font-medium text-primary hover:bg-primary/10 transition">
                             <Eye className="h-3.5 w-3.5" /> Ver
                           </button>
                         </td>
                         <td className="px-4 py-3 font-medium text-foreground max-w-[250px]">
                           <div className="space-y-1">
                             <Tooltip>
                               <TooltipTrigger asChild>
                                 <span className="block truncate">
                                   {pncpLink ? (
                                     <a href={pncpLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                                       {row.orgao} <ExternalLink className="h-3 w-3 shrink-0" />
                                     </a>
                                   ) : row.orgao}
                                 </span>
                               </TooltipTrigger>
                               <TooltipContent side="bottom" className="max-w-sm"><p>{row.orgao}</p></TooltipContent>
                             </Tooltip>
                             <StatusBadge situacao={row.situacao} hasWinner={!!row.vencedor_nome && row.vencedor_nome !== "—"} />
                           </div>
                         </td>
                         <td className="px-4 py-3 max-w-xs">
                           <Tooltip>
                             <TooltipTrigger asChild><span className="block truncate text-foreground">{row.objeto}</span></TooltipTrigger>
                             <TooltipContent side="bottom" className="max-w-md"><p className="text-xs leading-relaxed">{row.objeto}</p></TooltipContent>
                           </Tooltip>
                         </td>
                         <td className="px-4 py-3 text-muted-foreground">{row.modalidade || "—"}</td>
                          <td className="px-4 py-3 font-medium text-foreground">{formatCurrency(row.valor_estimado)}</td>
                           <td className="px-4 py-3 font-medium text-success">{row.valor_homologado ? formatCurrency(row.valor_homologado) : "—"}</td>
                           <td className="px-4 py-3 font-medium">
                             {row.valor_estimado && row.valor_homologado ? (
                               <span className={row.valor_estimado - row.valor_homologado > 0 ? "text-success" : "text-destructive"}>
                                 {formatCurrency(row.valor_estimado - row.valor_homologado)}
                               </span>
                             ) : "—"}
                           </td>
                           <td className="px-4 py-3 text-foreground max-w-[180px]">
                            <Tooltip>
                              <TooltipTrigger asChild><span className="block truncate">{row.vencedor_nome || "—"}</span></TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-sm"><p className="text-xs">{row.vencedor_nome || "Sem vencedor"}</p></TooltipContent>
                            </Tooltip>
                          </td>
                         <td className="px-4 py-3 text-muted-foreground">{formattedDate}</td>
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
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="flex h-9 w-9 items-center justify-center rounded-lg border border-input bg-card text-muted-foreground hover:bg-secondary disabled:opacity-40">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium text-foreground">{page + 1} / {totalPages.toLocaleString("pt-BR")}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="flex h-9 w-9 items-center justify-center rounded-lg border border-input bg-card text-muted-foreground hover:bg-secondary disabled:opacity-40">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Detail Modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="font-display text-lg font-bold text-foreground">Detalhes da Licitação</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-80px)]">
            {selectedLicitacao && (
              <div className="px-6 pb-6 space-y-6">
                {/* Header info */}
                <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground leading-tight">{selectedLicitacao.orgao}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{selectedLicitacao.objeto}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge situacao={selectedLicitacao.situacao} hasWinner={detailWinners.length > 0} />
                    {selectedLicitacao.modalidade && <Badge variant="outline" className="text-xs">{selectedLicitacao.modalidade}</Badge>}
                    {selectedLicitacao.numero_controle_pncp && (
                      (() => {
                        const match = selectedLicitacao.numero_controle_pncp.match(/^(\d+)-\d+-(\d+)\/(\d+)$/);
                        const link = match ? `https://pncp.gov.br/app/editais/${match[1]}/${match[3]}/${parseInt(match[2])}` : null;
                        return link ? (
                          <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 transition">
                            <ExternalLink className="h-3 w-3" /> Ver no PNCP
                          </a>
                        ) : null;
                      })()
                    )}
                  </div>
                </div>

                {/* AI Analysis */}
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Sparkles className="h-4 w-4 text-primary" /> Análise IA do Objeto
                    </h3>
                    <button
                      onClick={() => runAiAnalysis(selectedLicitacao.objeto, detailItems)}
                      disabled={aiLoading}
                      className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition disabled:opacity-50"
                    >
                      {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
                      {aiLoading ? "Analisando..." : aiAnalysis ? "Reanalisar" : "Analisar Objeto"}
                    </button>
                  </div>
                  {aiAnalysis && (
                    <div className="prose prose-sm max-w-none text-foreground [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_p]:text-sm [&_li]:text-sm [&_strong]:text-foreground">
                      <div dangerouslySetInnerHTML={{ __html: aiAnalysis.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>').replace(/^- (.*)/gm, '• $1') }} />
                    </div>
                  )}
                  {!aiAnalysis && !aiLoading && (
                    <p className="text-xs text-muted-foreground">Clique em "Analisar Objeto" para a IA identificar os itens e serviços desta licitação.</p>
                  )}
                </div>

                {/* Key metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-border bg-card p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-muted-foreground"><DollarSign className="h-3.5 w-3.5" /><span className="text-[10px] font-medium uppercase">Valor Estimado</span></div>
                    <p className="text-sm font-bold text-foreground">{formatCurrency(selectedLicitacao.valor_estimado)}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-muted-foreground"><DollarSign className="h-3.5 w-3.5" /><span className="text-[10px] font-medium uppercase">Valor Homologado</span></div>
                    <p className="text-sm font-bold text-foreground">{formatCurrency(selectedLicitacao.valor_homologado)}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-muted-foreground"><MapPin className="h-3.5 w-3.5" /><span className="text-[10px] font-medium uppercase">Local</span></div>
                    <p className="text-sm font-bold text-foreground">{[selectedLicitacao.municipio, selectedLicitacao.uf].filter(Boolean).join("/") || "—"}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-muted-foreground"><Clock className="h-3.5 w-3.5" /><span className="text-[10px] font-medium uppercase">Publicação</span></div>
                    <p className="text-sm font-bold text-foreground">{selectedLicitacao.data_publicacao ? format(new Date(selectedLicitacao.data_publicacao + "T12:00:00"), "dd/MM/yyyy") : "—"}</p>
                  </div>
                </div>

                {/* Additional info from raw_json */}
                {(() => {
                  const raw = selectedLicitacao.raw_json || {};
                  const infoItems = [
                    { label: "Data Resultado", value: selectedLicitacao.data_resultado ? format(new Date(selectedLicitacao.data_resultado + "T12:00:00"), "dd/MM/yyyy") : null },
                    { label: "Fonte", value: selectedLicitacao.fonte },
                    { label: "Nº Controle", value: selectedLicitacao.numero_controle_pncp, mono: true },
                    { label: "Critério de Julgamento", value: raw.criterioJulgamentoNome || raw.tipoCriterioJulgamento },
                    { label: "Modo de Disputa", value: raw.modoDisputaNome || raw.tipoModoDisputa },
                    { label: "Amparo Legal", value: raw.amparoLegal?.descricao || raw.amparoLegalNome },
                    { label: "Instrumento Convocatório", value: raw.tipoInstrumentoConvocatorioNome },
                    { label: "CNPJ Órgão", value: raw.orgaoEntidade?.cnpj },
                    { label: "Unidade Compradora", value: raw.unidadeOrgao?.nomeUnidade },
                    { label: "CNPJ Unidade", value: raw.unidadeOrgao?.cnpj },
                    { label: "Srp", value: raw.srp != null ? (raw.srp ? "Sim (Registro de Preços)" : "Não") : null },
                    { label: "Nº Processo", value: raw.processo?.numeroProcesso || raw.numeroProcesso },
                    { label: "Nº Edital", value: raw.numeroEdital },
                    { label: "Link do Sistema Origem", value: raw.linkSistemaOrigem, link: true },
                    { label: "Informação Complementar", value: raw.informacaoComplementar },
                  ].filter(i => i.value);
                  return infoItems.length > 0 ? (
                    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Informações Adicionais</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        {infoItems.map((item, idx) => (
                          <div key={idx}>
                            <span className="text-muted-foreground">{item.label}:</span>{" "}
                            {item.link ? (
                              <a href={String(item.value)} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline inline-flex items-center gap-1">
                                Acessar <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className={cn("font-medium text-foreground", item.mono && "font-mono text-xs")}>{String(item.value)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}

                <Separator />

                {/* Items */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Itens da Licitação</h3>
                    <Badge variant="secondary" className="text-[10px]">{detailItems.length}</Badge>
                  </div>
                  {detailLoading ? (
                    <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                  ) : detailItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">Nenhum item encontrado para esta licitação.</p>
                  ) : (
                    <div className="rounded-lg border border-border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-secondary/50 border-b border-border">
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground w-12">#</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Descrição</th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Qtd</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Und</th>
                             <th className="px-3 py-2 text-right font-medium text-muted-foreground">Val. Unit. Est.</th>
                             <th className="px-3 py-2 text-right font-medium text-muted-foreground">Val. Final Item</th>
                             <th className="px-3 py-2 text-left font-medium text-muted-foreground">Vencedor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailItems.map((item: any) => (
                            <tr key={item.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                              <td className="px-3 py-2 text-muted-foreground font-mono">{item.numero_item ?? "—"}</td>
                              <td className="px-3 py-2 text-foreground max-w-[280px]">
                                <Tooltip>
                                  <TooltipTrigger asChild><span className="block truncate">{item.descricao}</span></TooltipTrigger>
                                  <TooltipContent side="bottom" className="max-w-sm"><p className="text-xs">{item.descricao}</p></TooltipContent>
                                </Tooltip>
                              </td>
                              <td className="px-3 py-2 text-right text-foreground">{item.quantidade?.toLocaleString("pt-BR") ?? "—"}</td>
                              <td className="px-3 py-2 text-muted-foreground">{item.unidade || "—"}</td>
                              <td className="px-3 py-2 text-right text-foreground">{formatCurrency(item.valor_unitario_estimado)}</td>
                              <td className="px-3 py-2 text-right font-medium text-success">
                                {(() => {
                                  const venc = item.licitacao_vencedores;
                                  const winner = Array.isArray(venc) ? venc[0] : venc;
                                  return winner?.valor_final ? formatCurrency(winner.valor_final) : (item.valor_unitario_final ? formatCurrency(item.valor_unitario_final) : "—");
                                })()}
                              </td>
                              <td className="px-3 py-2 text-foreground text-xs max-w-[150px]">
                                {(() => {
                                  const venc = item.licitacao_vencedores;
                                  const winner = Array.isArray(venc) ? venc[0] : venc;
                                  return winner?.razao_social ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild><span className="block truncate">{winner.razao_social}</span></TooltipTrigger>
                                      <TooltipContent side="bottom" className="max-w-sm space-y-1">
                                        <p className="font-medium">{winner.razao_social}</p>
                                        {winner.cnpj && <p className="text-xs font-mono">CNPJ: {winner.cnpj}</p>}
                                        {winner.percentual_desconto != null && <p className="text-xs">Desconto: {winner.percentual_desconto.toFixed(2)}%</p>}
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : "—";
                                })()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Winners */}
                {detailWinners.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Award className="h-4 w-4 text-warning" />
                        <h3 className="text-sm font-semibold text-foreground">Vencedores</h3>
                        <Badge variant="secondary" className="text-[10px]">{detailWinners.length}</Badge>
                      </div>
                      <div className="space-y-2">
                        {detailWinners.map((w: any, i: number) => (
                          <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-warning/10">
                              <Trophy className="h-4 w-4 text-warning" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{w.razao_social || "—"}</p>
                              <p className="text-xs text-muted-foreground">
                                {w.cnpj && `CNPJ: ${w.cnpj}`}
                                {w.numero_item != null && ` · Item ${w.numero_item}`}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-bold text-success">{formatCurrency(w.valor_final)}</p>
                              {w.percentual_desconto != null && (
                                <p className="text-[10px] text-muted-foreground">-{w.percentual_desconto.toFixed(1)}%</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
