import { useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Loader2, Database, ChevronLeft, ChevronRight, X, Trophy, ExternalLink, ChevronDown, FileSpreadsheet, Eye, Package, Award, FileText, MapPin, DollarSign, Clock, Brain, Sparkles, Search, CalendarIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ComboboxFilter from "@/components/ComboboxFilter";


const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
const SITUACOES = ["Divulgada no PNCP", "Concluída", "Homologada", "Revogada", "Anulada", "Suspensa"];

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
  const displayStatus = hasWinner ? "Com Resultado" : situacao;
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
  const [page, setPage] = useState(0);
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const abortRef = useRef(false);
  const queryClient = useQueryClient();

  // Filter state
  const [filterOrgao, setFilterOrgao] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const defaultDateFrom = new Date(2023, 0, 1);
  const [filterDateFrom, setFilterDateFrom] = useState<Date | undefined>(defaultDateFrom);
  const [filterDateTo, setFilterDateTo] = useState<Date | undefined>();
  const [filterUf, setFilterUf] = useState("");
  const [filterSituacao, setFilterSituacao] = useState("");
  const [filterVencedor, setFilterVencedor] = useState("");

  // Server-side search for orgão options
  const [orgaoSearch, setOrgaoSearch] = useState("");
  const { data: orgaoOptions = [], isLoading: orgaosLoading } = useQuery({
    queryKey: ["filter-orgaos", orgaoSearch],
    queryFn: async () => {
      let query = supabase.from("mv_orgaos").select("orgao").order("total_licitacoes", { ascending: false }).limit(100);
      if (orgaoSearch) query = query.ilike("orgao", `%${orgaoSearch}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).filter((r: any) => r.orgao).map((r: any) => ({ label: r.orgao, value: r.orgao }));
    },
    staleTime: 60_000,
  });

  // Server-side search for vencedor options
  const [vencedorSearch, setVencedorSearch] = useState("");
  const { data: vencedorOptions = [], isLoading: vencedoresLoading } = useQuery({
    queryKey: ["filter-vencedores", vencedorSearch],
    queryFn: async () => {
      let query = supabase.from("mv_empresas_vencedoras").select("razao_social").order("total_vitorias", { ascending: false }).limit(100);
      if (vencedorSearch) query = query.ilike("razao_social", `%${vencedorSearch}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).filter((r: any) => r.razao_social).map((r: any) => ({ label: r.razao_social, value: r.razao_social }));
    },
    staleTime: 60_000,
  });


  const [appliedFilters, setAppliedFilters] = useState<{
    orgao: string; search: string; dateFrom?: string; dateTo?: string; uf?: string; situacao?: string; vencedor?: string;
  }>({ orgao: "", search: "", dateFrom: format(defaultDateFrom, "yyyy-MM-dd") });

  const handleSearch = () => {
    setPage(0);
    setAppliedFilters({
      orgao: filterOrgao.trim(),
      search: filterSearch.trim(),
      dateFrom: filterDateFrom ? format(filterDateFrom, "yyyy-MM-dd") : undefined,
      dateTo: filterDateTo ? format(filterDateTo, "yyyy-MM-dd") : undefined,
      uf: filterUf || undefined,
      situacao: filterSituacao || undefined,
      vencedor: filterVencedor.trim() || undefined,
    });
  };

  const handleClearFilters = () => {
    setFilterOrgao("");
    setFilterSearch("");
    setFilterDateFrom(defaultDateFrom);
    setFilterDateTo(undefined);
    setFilterUf("");
    setFilterSituacao("");
    setFilterVencedor("");
    setPage(0);
    setAppliedFilters({ orgao: "", search: "", dateFrom: format(defaultDateFrom, "yyyy-MM-dd") });
  };

  const hasActiveFilters = appliedFilters.orgao || appliedFilters.search || appliedFilters.dateFrom || appliedFilters.dateTo || appliedFilters.uf || appliedFilters.situacao || appliedFilters.vencedor;

  const searchByWinner = (name: string) => {
    setFilterVencedor(name);
    setDetailOpen(false);
    setPage(0);
    setAppliedFilters((prev) => ({ ...prev, vencedor: name }));
  };

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

  const { data: queryResult, isLoading, isError, error: queryError, refetch } = useQuery({
    queryKey: ["licitacoes-all", page, appliedFilters],
    queryFn: async () => {
      // When vencedor filter is active, use the RPC that supports JOINs
      if (appliedFilters.vencedor) {
        const hasResultadoStatus = appliedFilters.situacao === "Concluída" || appliedFilters.situacao === "Homologada";
        const { data, error } = await (supabase as any).rpc("search_licitacoes", {
          p_search: appliedFilters.search || null,
          p_orgao: appliedFilters.orgao || null,
          p_date_from: appliedFilters.dateFrom || null,
          p_date_to: appliedFilters.dateTo || null,
          p_uf: appliedFilters.uf || null,
          p_situacao: hasResultadoStatus ? null : appliedFilters.situacao || null,
          p_vencedor: appliedFilters.vencedor,
          p_modalidade: null,
          p_com_vencedor: hasResultadoStatus ? true : null,
          p_limit: PAGE_SIZE,
          p_offset: page * PAGE_SIZE,
        });
        if (error) throw error;
        const rows = data || [];
        const totalCount = rows[0]?.total_count || 0;
        return { rows, totalCount };
      }

      // Direct table query for fast results without vencedor filter
      let query = supabase
        .from("licitacoes")
        .select("id, orgao, objeto, modalidade, valor_estimado, valor_homologado, data_publicacao, uf, municipio, situacao, numero_controle_pncp", { count: "estimated" })
        .order("valor_homologado", { ascending: false, nullsFirst: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (appliedFilters.dateFrom) {
        query = query.gte("data_publicacao", appliedFilters.dateFrom);
      }
      if (appliedFilters.dateTo) {
        query = query.lte("data_publicacao", appliedFilters.dateTo);
      }
      if (appliedFilters.uf) {
        query = query.eq("uf", appliedFilters.uf);
      }
      if (appliedFilters.situacao === "Concluída" || appliedFilters.situacao === "Homologada") {
        query = query.not("valor_homologado", "is", null).gt("valor_homologado", 0);
      } else if (appliedFilters.situacao) {
        query = query.eq("situacao", appliedFilters.situacao);
      }
      if (appliedFilters.orgao) {
        query = query.ilike("orgao", `%${appliedFilters.orgao}%`);
      }
      if (appliedFilters.search) {
        const keywords = appliedFilters.search.split(/\s+/).filter(Boolean);
        for (const kw of keywords) {
          query = query.ilike("objeto", `%${kw}%`);
        }
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data || [], totalCount: count || 0 };
    },
    placeholderData: (prev) => prev,
    staleTime: 60_000,
    retry: 1,
    retryDelay: 2000,
    refetchOnWindowFocus: false,
  });

  const licitacoes = queryResult?.rows || [];
  const totalCount = queryResult?.totalCount || 0;
  const hasData = licitacoes.length > 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

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
            if (grandTotal % 500 < 50) { queryClient.invalidateQueries({ queryKey: ["licitacoes-all"] }); }
          } catch { consecutiveErrors++; if (consecutiveErrors >= 3) hasMore = false; await new Promise(r => setTimeout(r, 1000)); }
        }
      }
    }
    setProgress(p => (p ? { ...p, isRunning: false } : null));
    queryClient.invalidateQueries({ queryKey: ["licitacoes-all"] });
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
        if (totalProcessed % 100 < 30) queryClient.invalidateQueries({ queryKey: ["licitacoes-all"] });
      } catch { await new Promise(r => setTimeout(r, 2000)); }
    }
    setProgress(p => (p ? { ...p, isRunning: false } : null));
    queryClient.invalidateQueries({ queryKey: ["licitacoes-all"] });
    toast.success(`Vencedores: ${totalWinners.toLocaleString("pt-BR")} encontrados em ${totalProcessed.toLocaleString("pt-BR")} licitações.`);
  }, [queryClient]);

  const cancelIngestion = () => { abortRef.current = true; toast.info("Cancelando..."); };

  const [exporting, setExporting] = useState(false);

  const exportToExcel = useCallback(async () => {
    setExporting(true);
    try {
      let allData: any[] = [];
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;
      while (hasMore && allData.length < 10000) {
        const { data, error } = await supabase
          .from("licitacoes")
          .select("orgao, objeto, modalidade, valor_estimado, valor_homologado, data_publicacao, uf, municipio, situacao")
          .order("valor_homologado", { ascending: false, nullsFirst: false })
          .range(offset, offset + batchSize - 1);
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
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Licitações</h1>
          <p className="text-sm text-muted-foreground">
            {totalCount > 0
              ? `${totalCount.toLocaleString("pt-BR")} licitações com resultado · Ordenadas por maior valor`
              : "Carregando dados..."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportToExcel} disabled={exporting || !hasData} className="flex h-9 items-center gap-2 rounded-lg border border-input bg-card px-3 text-xs font-medium text-muted-foreground hover:bg-secondary transition disabled:opacity-50">
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
            Exportar Excel
          </button>
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
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <label className="text-xs font-medium text-muted-foreground">Palavra-chave do Objeto</label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-4 w-4 p-0 hover:bg-transparent">
                    <span className="text-[10px] text-muted-foreground cursor-help">ⓘ</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">Use espaços entre palavras para buscar todas juntas (AND). Ex: "serviços consultoria" encontra licitações que contêm ambas as palavras no objeto.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Input
              placeholder="Ex: computador, limpeza..."
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Órgão</label>
            <ComboboxFilter
              value={filterOrgao}
              onChange={setFilterOrgao}
              options={orgaoOptions}
              placeholder="Selecionar órgão..."
              searchPlaceholder="Buscar órgão..."
              isLoading={orgaosLoading}
              onServerSearch={setOrgaoSearch}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Data Início</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("h-9 w-full justify-start text-left font-normal", !filterDateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {filterDateFrom ? format(filterDateFrom, "dd/MM/yyyy") : "Selecionar..."}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={filterDateFrom} onSelect={setFilterDateFrom} locale={ptBR} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Data Fim</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("h-9 w-full justify-start text-left font-normal", !filterDateTo && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {filterDateTo ? format(filterDateTo, "dd/MM/yyyy") : "Selecionar..."}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={filterDateTo} onSelect={setFilterDateTo} locale={ptBR} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Estado (UF)</label>
            <Select value={filterUf} onValueChange={(v) => setFilterUf(v === "__all__" ? "" : v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {UFS.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Vencedor</label>
            <ComboboxFilter
              value={filterVencedor}
              onChange={setFilterVencedor}
              options={vencedorOptions}
              placeholder="Selecionar vencedor..."
              searchPlaceholder="Buscar vencedor..."
              isLoading={vencedoresLoading}
              onServerSearch={setVencedorSearch}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={filterSituacao} onValueChange={(v) => setFilterSituacao(v === "__all__" ? "" : v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {SITUACOES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={handleSearch} className="h-9 flex-1 gap-2">
              <Search className="h-3.5 w-3.5" /> Pesquisar
            </Button>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={handleClearFilters} className="h-9 px-2 text-muted-foreground">
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
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

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center py-20">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
            <Database className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="mt-4 font-display text-lg font-semibold text-foreground">Erro ao carregar licitações</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md text-center">
            {(queryError as any)?.message || "A consulta falhou. Tente filtros mais específicos ou tente novamente."}
          </p>
          <Button onClick={() => refetch()} variant="outline" className="mt-4 gap-2">
            <RefreshCw className="h-4 w-4" /> Tentar novamente
          </Button>
        </motion.div>
      ) : !hasData ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center py-20">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Database className="h-8 w-8 text-primary" />
          </div>
          <h2 className="mt-4 font-display text-lg font-semibold text-foreground">Nenhuma licitação encontrada</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md text-center">
            Use o menu "Ingestão" para buscar dados do PNCP.
          </p>
        </motion.div>
      ) : (
        <>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground w-16"></th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Órgão</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Objeto</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Modalidade</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Valor Est.</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Val. Homologado</th>
                     <th className="px-4 py-3 text-right font-medium text-muted-foreground">Economia</th>
                     <th className="px-4 py-3 text-left font-medium text-muted-foreground">Vencedor</th>
                     <th className="px-4 py-3 text-left font-medium text-muted-foreground">Data</th>
                     <th className="px-4 py-3 text-center font-medium text-muted-foreground">UF</th>
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
                      <tr key={row.id} className="border-b border-border last:border-0 transition hover:bg-secondary/30 cursor-pointer" onClick={() => openDetail(row)}>
                        <td className="px-4 py-3">
                          <button className="flex h-7 w-7 items-center justify-center rounded-lg border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition">
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground max-w-[220px]">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block truncate">
                                {pncpLink ? (
                                  <a href={pncpLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-primary hover:underline">
                                    {row.orgao} <ExternalLink className="h-3 w-3 shrink-0" />
                                  </a>
                                ) : row.orgao}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-sm"><p>{row.orgao}</p></TooltipContent>
                          </Tooltip>
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <Tooltip>
                            <TooltipTrigger asChild><span className="block truncate text-foreground">{row.objeto}</span></TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-md"><p className="text-xs leading-relaxed">{row.objeto}</p></TooltipContent>
                          </Tooltip>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{row.modalidade || "—"}</td>
                        <td className="px-4 py-3 text-right font-medium text-foreground tabular-nums">{formatCurrency(row.valor_estimado)}</td>
                        <td className="px-4 py-3 text-right font-medium text-success tabular-nums">{row.valor_homologado ? formatCurrency(row.valor_homologado) : "—"}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          {row.valor_estimado && row.valor_homologado ? (
                            <span className={row.valor_estimado - row.valor_homologado > 0 ? "text-success" : "text-destructive"}>
                              {formatCurrency(row.valor_estimado - row.valor_homologado)}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 max-w-[200px]" onClick={(e) => e.stopPropagation()}>
                          {row.vencedor_nome ? (
                            <button
                              onClick={() => searchByWinner(row.vencedor_nome)}
                              className="block truncate text-primary text-xs font-medium hover:underline text-left max-w-full"
                              title={`Ver todas licitações de ${row.vencedor_nome}`}
                            >
                              {row.vencedor_nome}
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{formattedDate}</td>
                        <td className="px-4 py-3 text-center text-muted-foreground text-xs font-medium">{row.uf || "—"}</td>
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
              Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} de {totalCount.toLocaleString("pt-BR")}
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
        <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] p-0 gap-0 overflow-hidden">
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
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiAnalysis}</ReactMarkdown>
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
                              <button
                                onClick={() => w.razao_social && searchByWinner(w.razao_social)}
                                className="text-sm font-medium text-primary truncate hover:underline text-left"
                                title={`Ver todas licitações de ${w.razao_social}`}
                              >
                                {w.razao_social || "—"}
                              </button>
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
