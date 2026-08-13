import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, Loader2, Database, ChevronLeft, ChevronRight, X, Trophy, ExternalLink, ChevronDown, FileSpreadsheet, Eye, Package, Award, FileText, MapPin, DollarSign, Clock, Brain, Sparkles, Search, CalendarIcon, SlidersHorizontal, AlertTriangle } from "lucide-react";
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
import { cacheKey, readCache, writeCache, clearNamespace } from "@/lib/shortCache";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OrgaoScoreBadge } from "@/components/OrgaoScoreBadge";
import ComboboxFilter from "@/components/ComboboxFilter";
import ComboboxMultiFilter from "@/components/ComboboxMultiFilter";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IngestaoManualButton } from "@/components/dashboard/IngestaoManualButton";
import { useAuth } from "@/contexts/AuthContext";
import { useTracker } from "@/hooks/useTracking";
import TagInput from "@/components/TagInput";


const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

const MODALIDADE_OPTIONS = [
  "Pregão - Eletrônico",
  "Pregão - Presencial",
  "Concorrência - Eletrônica",
  "Concorrência - Presencial",
  "Dispensa de Licitação",
  "Inexigibilidade",
  "Concurso",
  "Leilão - Eletrônico",
  "Leilão - Presencial",
  "Diálogo Competitivo",
  "Credenciamento",
  "Manifestação de Interesse",
  "Pré-qualificação",
];

/** Alterna entre exigir todos os termos (AND) ou qualquer um (OR). */
function ModeToggle({ value, onChange }: { value: "all" | "any"; onChange: (v: "all" | "any") => void }) {
  return (
    <div className="ml-auto flex items-center gap-0.5 rounded-md bg-secondary/70 p-0.5">
      {(["all", "any"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={cn(
            "rounded px-1.5 text-[10px] font-medium leading-4 transition-colors",
            value === m ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {m === "all" ? "TODOS" : "QUALQUER"}
        </button>
      ))}
    </div>
  );
}

const STATUS_ABERTAS = [
  { value: "", label: "Todas" },
  { value: "Divulgada no PNCP", label: "Divulgadas" },
  { value: "Suspensa", label: "Suspensas" },
];

const STATUS_ENCERRADAS = [
  { value: "", label: "Todas" },
  { value: "Concluída", label: "Com Resultado" },
  { value: "Revogada", label: "Revogadas" },
  { value: "Anulada", label: "Anuladas" },
];

const PAGE_SIZE = 20;
const QUERY_TIMEOUT_MS = 12_000;
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;

async function withTimeout<T>(
  promiseLike: PromiseLike<T>,
  timeoutMs = QUERY_TIMEOUT_MS,
  message = "A consulta demorou demais. Tente refinar os filtros."
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([Promise.resolve(promiseLike), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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

function StatusBadge({ situacao, hasWinner, valorHomologado }: { situacao: string | null; hasWinner?: boolean; valorHomologado?: number | null }) {
  const hasResult = hasWinner || (valorHomologado != null && valorHomologado > 0);
  if (!situacao && !hasResult) return <span className="text-muted-foreground text-xs">—</span>;
  const displayStatus = hasResult ? "Com Resultado" : situacao;
  const normalized = (displayStatus || "").toLowerCase();
  const color = hasResult || normalized.includes("homologad") || normalized.includes("conclu") || normalized.includes("resultado")
    ? "bg-success/10 text-success border-success/20"
    : normalized.includes("andamento") || normalized.includes("abert") || normalized.includes("divulgada")
    ? "bg-info/10 text-info border-info/20"
    : normalized.includes("revogad") || normalized.includes("anulad") || normalized.includes("suspens")
    ? "bg-destructive/10 text-destructive border-destructive/20"
    : "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${color}`}>
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
  const [activeTab, setActiveTab] = useState<"abertas" | "encerradas">("abertas");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [page, setPage] = useState(0);
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const abortRef = useRef(false);
  const queryClient = useQueryClient();
  const { role, empresaId } = useAuth();
  const isAdminCentral = role === "admin_central";
  const track = useTracker();

  const statusOptions = activeTab === "abertas" ? STATUS_ABERTAS : STATUS_ENCERRADAS;

  // Tab counts query - uses estimated counts for speed
  const { data: tabCounts } = useQuery({
    queryKey: ["licitacoes-tab-counts"],
    queryFn: async () => {
      // Encerradas = valor_homologado > 0 OR situacao in (Revogada, Anulada)
      // Abertas = tudo que NÃO é encerrada (complemento exato)
      const [totalRes, encerradasRes] = await Promise.all([
        supabase
          .from("licitacoes")
          .select("id", { count: "estimated", head: true }),
        supabase
          .from("licitacoes")
          .select("id", { count: "estimated", head: true })
          .or("valor_homologado.gt.0,situacao.in.(Revogada,Anulada)"),
      ]);
      const total = totalRes.count || 0;
      const encerradas = encerradasRes.count || 0;
      return {
        abertas: total - encerradas,
        encerradas,
      };
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });

  // Filter state (todos multi-seleção)
  const [filterOrgaos, setFilterOrgaos] = useState<string[]>([]);
  const [filterTermos, setFilterTermos] = useState<string[]>([]);
  const [filterTermosMode, setFilterTermosMode] = useState<"all" | "any">("all");
  const [filterItens, setFilterItens] = useState<string[]>([]);
  const [filterItensMode, setFilterItensMode] = useState<"all" | "any">("all");
  const defaultDateFrom = new Date(2023, 0, 1);
  const [filterDateFrom, setFilterDateFrom] = useState<Date | undefined>(defaultDateFrom);
  const [filterDateTo, setFilterDateTo] = useState<Date | undefined>();
  const [filterUfs, setFilterUfs] = useState<string[]>([]);
  const [filterSituacoes, setFilterSituacoes] = useState<string[]>([]);
  const [filterModalidades, setFilterModalidades] = useState<string[]>([]);
  const [filterSort, setFilterSort] = useState<"recentes" | "valor" | "estimado">("recentes");
  const [filterVencedores, setFilterVencedores] = useState<string[]>([]);
  const [filterApenasParticipei, setFilterApenasParticipei] = useState(false);

  // IDs de licitações onde a empresa do usuário registrou participação
  const { data: minhasParticipacaoIds } = useQuery({
    queryKey: ["minhas-participacoes-ids", empresaId],
    enabled: !!empresaId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cliente_participacoes")
        .select("licitacao_id")
        .eq("empresa_cliente_id", empresaId!)
        .eq("participou", true);
      if (error) throw error;
      return (data ?? []).map((r) => r.licitacao_id).filter(Boolean) as string[];
    },
  });

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

  // Vencedor stats query - lightweight using materialized view
  const { data: vencedorStats } = useQuery({
    queryKey: ["vencedor-stats", filterVencedores],
    queryFn: async () => {
      if (!filterVencedores.length) return null;
      const promises = filterVencedores.map(async (v) => {
        const { data } = await supabase
          .from("mv_empresas_vencedoras")
          .select("total_vitorias, razao_social")
          .ilike("razao_social", `%${v}%`)
          .limit(1)
          .maybeSingle();
        return { name: v, total: data?.total_vitorias || 0 };
      });
      const results = await Promise.all(promises);
      return { items: results, totalSum: results.reduce((s, r) => s + r.total, 0) };
    },
    enabled: filterVencedores.length > 0,
    staleTime: 300_000,
  });


  type AppliedFilters = {
    orgaos: string[];
    termos: string[];
    termosMode: "all" | "any";
    itens: string[];
    itensMode: "all" | "any";
    ufs: string[];
    situacoes: string[];
    modalidades: string[];
    vencedores: string[];
    sort: "recentes" | "valor" | "estimado";
    dateFrom?: string;
    dateTo?: string;
    apenasParticipei?: boolean;
    tab: "abertas" | "encerradas";
  };

  const emptyApplied = (tab: "abertas" | "encerradas"): AppliedFilters => ({
    orgaos: [], termos: [], termosMode: "all", itens: [], itensMode: "all",
    ufs: [], situacoes: [], modalidades: [], vencedores: [], sort: "recentes",
    dateFrom: format(defaultDateFrom, "yyyy-MM-dd"), tab,
  });

  const [appliedFilters, setAppliedFilters] = useState<AppliedFilters>(emptyApplied("abertas"));

  const hasWinnerFilter = filterVencedores.length > 0;

  const activateWinnerMode = () => {
    setActiveTab("encerradas");
    setFilterSituacoes([]);
  };

  const handleWinnerFilterChange = (values: string[]) => {
    setFilterVencedores(values);
    if (values.length > 0) activateWinnerMode();
  };

  const buildApplied = (tab: "abertas" | "encerradas", situacoes: string[]): AppliedFilters => ({
    orgaos: filterOrgaos,
    termos: filterTermos,
    termosMode: filterTermosMode,
    itens: filterItens,
    itensMode: filterItensMode,
    ufs: filterUfs,
    situacoes,
    modalidades: filterModalidades,
    vencedores: filterVencedores,
    sort: filterSort,
    dateFrom: filterDateFrom ? format(filterDateFrom, "yyyy-MM-dd") : undefined,
    dateTo: filterDateTo ? format(filterDateTo, "yyyy-MM-dd") : undefined,
    apenasParticipei: filterApenasParticipei || undefined,
    tab,
  });

  const handleSearch = () => {
    const nextTab = hasWinnerFilter ? "encerradas" : activeTab;
    const nextSituacoes = hasWinnerFilter ? [] : filterSituacoes;

    setPage(0);
    if (hasWinnerFilter) activateWinnerMode();

    const next = buildApplied(nextTab, nextSituacoes);
    setAppliedFilters(next);
    track("busca", {
      page: "licitacoes",
      termos: next.termos.length,
      itens: next.itens.length,
      orgaos: next.orgaos.length,
      ufs: next.ufs.length,
      situacoes: next.situacoes.length,
      modalidades: next.modalidades.length,
      vencedores: next.vencedores.length,
      has_date_range: !!(next.dateFrom || next.dateTo),
      sort: next.sort,
      tab: next.tab,
    });
  };

  const handleTabChange = (tab: "abertas" | "encerradas") => {
    setActiveTab(tab);
    setFilterSituacoes([]);
    setFilterVencedores([]);
    setPage(0);
    setAppliedFilters({ ...buildApplied(tab, []), vencedores: [] });
  };

  const handleClearFilters = () => {
    setFilterOrgaos([]);
    setFilterTermos([]);
    setFilterItens([]);
    setFilterModalidades([]);
    setFilterDateFrom(defaultDateFrom);
    setFilterDateTo(undefined);
    setFilterUfs([]);
    setFilterSituacoes([]);
    setFilterVencedores([]);
    setFilterApenasParticipei(false);
    setFilterSort("recentes");
    setPage(0);
    setAppliedFilters(emptyApplied(activeTab));
  };

  const hasActiveFilters =
    appliedFilters.orgaos.length || appliedFilters.termos.length || appliedFilters.itens.length ||
    appliedFilters.ufs.length || appliedFilters.situacoes.length || appliedFilters.modalidades.length ||
    appliedFilters.vencedores.length || appliedFilters.dateFrom || appliedFilters.dateTo ||
    appliedFilters.apenasParticipei;

  const searchByWinner = (name: string) => {
    activateWinnerMode();
    setFilterVencedores([name]);
    setDetailOpen(false);
    setPage(0);
    setAppliedFilters((prev) => ({ ...prev, vencedores: [name], situacoes: [], tab: "encerradas" }));
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
    track("ia_consulta", { page: "licitacoes", tipo: "analyze-objeto", itens_count: items.length });
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

  const isAbertas = appliedFilters.vencedores.length > 0 ? false : appliedFilters.tab === "abertas";
  const hasResultadoStatus = appliedFilters.situacoes.includes("Concluída");

  const nz = (arr: string[]) => (arr.length ? arr : null);

  const buildRpcArgs = (limit: number, offset: number) => ({
    p_terms: nz(appliedFilters.termos),
    p_terms_mode: appliedFilters.termosMode,
    p_itens: nz(appliedFilters.itens),
    p_itens_mode: appliedFilters.itensMode,
    p_orgaos: nz(appliedFilters.orgaos),
    p_ufs: nz(appliedFilters.ufs),
    p_situacoes: hasResultadoStatus && !isAbertas ? null : nz(appliedFilters.situacoes),
    p_modalidades: nz(appliedFilters.modalidades),
    p_vencedores: nz(appliedFilters.vencedores),
    p_date_from: appliedFilters.dateFrom || null,
    p_date_to: appliedFilters.dateTo || null,
    p_com_vencedor: !isAbertas && hasResultadoStatus,
    p_sem_resultado: isAbertas,
    p_sort: appliedFilters.sort,
    p_limit: limit,
    p_offset: offset,
  });

  const participacaoKeyPart = appliedFilters.apenasParticipei ? (minhasParticipacaoIds ?? []).length : 0;
  const pageQueryKey = (p: number) => ["licitacoes-all", p, appliedFilters, participacaoKeyPart];

  const fetchPage = async (pageIndex: number) => {
    const args = buildRpcArgs(PAGE_SIZE + 1, pageIndex * PAGE_SIZE);
    const key = cacheKey("licitacoes", { args, participacaoKeyPart, part: appliedFilters.apenasParticipei });

    // Cache curto (5 min): buscas repetidas não voltam ao banco.
    const cached = readCache<{ rows: any[]; totalCount: number; partial: boolean; hasMore: boolean }>(key);
    if (cached) return { ...cached, fromCache: true };

    const vencedoresAtivos = appliedFilters.vencedores.length > 0;
    let partial = false;
    let data: any[] | null = null;

    try {
      const rpcPromise = (supabase as any).rpc("search_licitacoes_v2", args);
      const rpcResult = await withTimeout<{ data: any[] | null; error: any }>(
        rpcPromise as PromiseLike<{ data: any[] | null; error: any }>,
        QUERY_TIMEOUT_MS,
        "A busca demorou demais. Refine os filtros e tente novamente."
      );
      if (rpcResult.error) throw rpcResult.error;
      data = rpcResult.data;
    } catch (err) {
      // Fallback: quando o filtro por vencedor falha ou demora, usamos a rota rápida
      // (somente vencedores + ordenação), retornando resultados parciais.
      if (!vencedoresAtivos) throw err;
      console.warn("Fallback de vencedores acionado:", err);
      const fbPromise = (supabase as any).rpc("search_licitacoes_por_vencedor_fast", {
        p_vencedores: appliedFilters.vencedores,
        p_sort: appliedFilters.sort,
        p_limit: PAGE_SIZE + 1,
        p_offset: pageIndex * PAGE_SIZE,
      });
      const fbResult = await withTimeout<{ data: any[] | null; error: any }>(
        fbPromise as PromiseLike<{ data: any[] | null; error: any }>,
        QUERY_TIMEOUT_MS,
        "A busca por vencedor demorou demais. Tente novamente."
      );
      if (fbResult.error) throw fbResult.error;
      data = fbResult.data;
      partial = true;
    }

    let fetchedRows = (data || []) as any[];

    if (appliedFilters.apenasParticipei) {
      const ids = new Set(minhasParticipacaoIds ?? []);
      fetchedRows = fetchedRows.filter((r) => ids.has(r.id));
    }

    const hasMore = fetchedRows.length > PAGE_SIZE;
    const rows = hasMore ? fetchedRows.slice(0, PAGE_SIZE) : fetchedRows;
    const rpcTotal = Number(fetchedRows[0]?.total_count ?? 0);
    const totalCount = appliedFilters.apenasParticipei
      ? rows.length
      : rpcTotal > 0
      ? rpcTotal
      : hasMore
      ? (pageIndex + 2) * PAGE_SIZE + 1
      : pageIndex * PAGE_SIZE + rows.length;

    const result = { rows, totalCount, partial, hasMore };
    // resultados parciais (fallback) têm TTL menor
    writeCache(key, result, partial ? 60_000 : SEARCH_CACHE_TTL_MS);
    return { ...result, fromCache: false };
  };

  const { data: queryResult, isLoading, isFetching, isError, error: queryError, refetch } = useQuery({
    queryKey: pageQueryKey(page),
    queryFn: () => fetchPage(page),
    placeholderData: (prev) => prev,
    staleTime: SEARCH_CACHE_TTL_MS,
    gcTime: 30 * 60 * 1000,
    retry: 0,
    retryDelay: 2000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });


  const licitacoes = queryResult?.rows || [];
  const totalCount = queryResult?.totalCount || 0;
  const hasData = licitacoes.length > 0;
  const isPartial = Boolean((queryResult as any)?.partial);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasNextPage = Boolean((queryResult as any)?.hasMore) || page < totalPages - 1;

  // Carregamento progressivo: pré-carrega a próxima página em segundo plano,
  // para que a navegação seja instantânea mesmo com muitos resultados.
  useEffect(() => {
    if (!queryResult || isFetching || isError || !hasNextPage) return;
    const next = page + 1;
    const timer = setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: pageQueryKey(next),
        queryFn: () => fetchPage(next),
        staleTime: SEARCH_CACHE_TTL_MS,
      });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, queryResult, isFetching, isError, hasNextPage]);


  // Empenhos agregados para as licitações visíveis (coluna "Empenhado")
  const visibleIds = licitacoes.map((r: any) => r.id).filter(Boolean);
  const { data: empenhosMap } = useQuery({
    queryKey: ["empenhos-por-licitacoes", visibleIds],
    enabled: visibleIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("empenhos_por_licitacoes", {
        p_licitacao_ids: visibleIds,
      });
      if (error) { console.warn("empenhos_por_licitacoes:", error.message); return {}; }
      const map: Record<string, { total_empenhado: number; total_liquidado: number; total_pago: number; qtd_empenhos: number }> = {};
      (data || []).forEach((r: any) => { map[r.licitacao_id] = r; });
      return map;
    },
  });

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
            if (grandTotal % 500 < 50) { clearNamespace("licitacoes"); queryClient.invalidateQueries({ queryKey: ["licitacoes-all"] }); }
          } catch { consecutiveErrors++; if (consecutiveErrors >= 3) hasMore = false; await new Promise(r => setTimeout(r, 1000)); }
        }
      }
    }
    setProgress(p => (p ? { ...p, isRunning: false } : null));
    clearNamespace("licitacoes"); queryClient.invalidateQueries({ queryKey: ["licitacoes-all"] });
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
        if (totalProcessed % 100 < 30) { clearNamespace("licitacoes"); queryClient.invalidateQueries({ queryKey: ["licitacoes-all"] }); }
      } catch { await new Promise(r => setTimeout(r, 2000)); }
    }
    setProgress(p => (p ? { ...p, isRunning: false } : null));
    clearNamespace("licitacoes"); queryClient.invalidateQueries({ queryKey: ["licitacoes-all"] });
    toast.success(`Vencedores: ${totalWinners.toLocaleString("pt-BR")} encontrados em ${totalProcessed.toLocaleString("pt-BR")} licitações.`);
  }, [queryClient]);

  const cancelIngestion = () => { abortRef.current = true; toast.info("Cancelando..."); };

  const [exporting, setExporting] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportPreview, setExportPreview] = useState<{
    uiCount: number;
    serverCount: number | null;
    diff: number | null;
    tolerance: number;
    inconsistent: boolean;
    loading: boolean;
  } | null>(null);

  // Build a human-readable summary of currently applied filters
  const appliedFiltersSummary = useCallback(() => {
    const items: { label: string; value: string }[] = [];
    items.push({ label: "Aba", value: appliedFilters.tab === "abertas" ? "Abertas / Em Andamento" : "Encerradas / Com Resultado" });
    if (appliedFilters.termos.length) items.push({ label: `Palavras-chave (${appliedFilters.termosMode === "all" ? "todas" : "qualquer"})`, value: appliedFilters.termos.join(", ") });
    if (appliedFilters.itens.length) items.push({ label: `Itens (${appliedFilters.itensMode === "all" ? "todos" : "qualquer"})`, value: appliedFilters.itens.join(", ") });
    if (appliedFilters.orgaos.length) items.push({ label: "Órgãos", value: appliedFilters.orgaos.join(", ") });
    if (appliedFilters.ufs.length) items.push({ label: "UFs", value: appliedFilters.ufs.join(", ") });
    if (appliedFilters.situacoes.length) items.push({ label: "Situações", value: appliedFilters.situacoes.join(", ") });
    if (appliedFilters.modalidades.length) items.push({ label: "Modalidades", value: appliedFilters.modalidades.join(", ") });
    if (appliedFilters.vencedores.length) items.push({ label: "Vencedores", value: appliedFilters.vencedores.join(", ") });
    if (appliedFilters.dateFrom) items.push({ label: "Data inicial", value: appliedFilters.dateFrom });
    if (appliedFilters.dateTo) items.push({ label: "Data final", value: appliedFilters.dateTo });
    return items;
  }, [appliedFilters]);

  // Compute server-side count using the same filter logic as the export
  const computeExportCount = useCallback(async (): Promise<number | null> => {
    const MAX_EXPORT = 10000;
    try {
      const probeBatch = 1000;
      let probed = 0;
      let off = 0;
      let more = true;
      while (more && probed <= MAX_EXPORT) {
        const { data, error } = await (supabase as any).rpc("search_licitacoes_v2", buildRpcArgs(probeBatch, off));
        if (error) throw error;
        const n = (data || []).length;
        if (n > 0 && off === 0) {
          const total = Number((data as any[])[0]?.total_count ?? 0);
          if (total > 0) return Math.min(total, MAX_EXPORT);
        }
        probed += n;
        more = n === probeBatch;
        off += probeBatch;
      }
      return probed;
    } catch (e) {
      console.warn("Count validation failed:", e);
      return null;
    }
  }, [appliedFilters, isAbertas]);

  // Open the export dialog and pre-compute counts
  const openExportDialog = useCallback(async () => {
    const uiCount = totalCount;
    setExportPreview({ uiCount, serverCount: null, diff: null, tolerance: 0, inconsistent: false, loading: true });
    setExportDialogOpen(true);
    const serverCount = await computeExportCount();
    const tolerance = Math.max(10, Math.ceil(uiCount * 0.05));
    const diff = serverCount !== null ? Math.abs(serverCount - uiCount) : null;
    const inconsistent = diff !== null && diff > tolerance;
    setExportPreview({ uiCount, serverCount, diff, tolerance, inconsistent, loading: false });
  }, [totalCount, computeExportCount]);

  const exportToExcel = useCallback(async () => {
    setExporting(true);
    setExportDialogOpen(false);
    try {
      const MAX_EXPORT = 10000;
      const batchSize = 1000;

      let allData: any[] = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore && allData.length < MAX_EXPORT) {
        const { data, error } = await (supabase as any).rpc("search_licitacoes_v2", buildRpcArgs(batchSize, offset));
        if (error) throw error;
        const rows = (data || []) as any[];
        allData = allData.concat(rows);
        hasMore = rows.length === batchSize;
        offset += batchSize;
      }

      if (allData.length > MAX_EXPORT) allData = allData.slice(0, MAX_EXPORT);

      if (allData.length === 0) {
        toast.info("Nenhum registro encontrado para os filtros aplicados.");
        return;
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
      track("export", { page: "licitacoes", format: "xlsx", rows: rows.length });
      toast.success(`${rows.length.toLocaleString("pt-BR")} registros exportados com sucesso!`);
    } catch (err) { console.error("Export error:", err); toast.error("Erro ao exportar dados."); }
    finally { setExporting(false); }
  }, [appliedFilters, isAbertas]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Licitações</h1>
          <p className="text-sm text-muted-foreground">
            {activeTab === "abertas" ? "Abertas · Mais recentes primeiro" : "Encerradas · Ordenadas por maior valor"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openExportDialog} disabled={exporting || !hasData} className="flex h-9 items-center gap-2 rounded-lg border border-input bg-card px-3 text-xs font-medium text-muted-foreground shadow-xs transition hover:bg-secondary disabled:opacity-50">
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
            Exportar Excel
          </button>
          {isAdminCentral && <IngestaoManualButton />}
        </div>
      </div>

      {/* Painel único: abas + indicadores + filtros */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {/* Abas de status */}
        <div className="flex overflow-x-auto border-b border-border">
          {([
            { key: "abertas" as const, label: "Abertas / Em Andamento", icon: Clock, count: tabCounts?.abertas },
            { key: "encerradas" as const, label: "Encerradas / Com Resultado", icon: Award, count: tabCounts?.encerradas },
          ]).map((t) => {
            const active = activeTab === t.key;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => handleTabChange(t.key)}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 border-b-2 px-5 py-4 text-sm transition-colors",
                  active
                    ? "border-primary font-semibold text-primary"
                    : "border-transparent font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="whitespace-nowrap">{t.label}</span>
                {t.count != null && (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                      active ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
                    )}
                  >
                    {t.count.toLocaleString("pt-BR")}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Indicadores */}
        {tabCounts && (
          <div className="grid grid-cols-1 divide-y divide-border border-b border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {[
              { label: "Total Geral", value: tabCounts.abertas + tabCounts.encerradas, icon: Database, tone: "bg-primary/10 text-primary" },
              { label: "Abertas", value: tabCounts.abertas, icon: Clock, tone: "bg-info/10 text-info" },
              { label: "Encerradas", value: tabCounts.encerradas, icon: Award, tone: "bg-success/10 text-success" },
            ].map((kpi) => {
              const Icon = kpi.icon;
              return (
                <div key={kpi.label} className="flex items-center gap-4 px-5 py-4">
                  <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", kpi.tone)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{kpi.label}</p>
                    <p className="truncate font-display text-2xl font-bold tabular-nums text-foreground">
                      {kpi.value.toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Filters */}
        <div className="space-y-4 bg-secondary/30 p-4 sm:p-5">

        {/* Row 1: Objeto + Itens + Status — multi-seleção */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
          <div className="space-y-1.5 lg:col-span-5">
            <div className="flex h-4 items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">Palavras-chave (objeto)</label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help text-[10px] text-muted-foreground">ⓘ</span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">Digite um termo e pressione <strong>Enter</strong> (ou vírgula) para adicionar vários. Escolha se a licitação precisa conter <strong>todos</strong> os termos ou <strong>qualquer um</strong>.</p>
                </TooltipContent>
              </Tooltip>
              <ModeToggle value={filterTermosMode} onChange={setFilterTermosMode} />
            </div>
            <TagInput
              values={filterTermos}
              onChange={setFilterTermos}
              placeholder="Ex: plataforma ead, consultoria... (Enter para adicionar)"
              onEnterEmpty={handleSearch}
            />
          </div>
          <div className="space-y-1.5 lg:col-span-4">
            <div className="flex h-4 items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">Itens</label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help text-[10px] text-muted-foreground">ⓘ</span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">Busca na <strong>descrição dos itens</strong>. Vários termos podem ser combinados.</p>
                </TooltipContent>
              </Tooltip>
              <ModeToggle value={filterItensMode} onChange={setFilterItensMode} />
            </div>
            <TagInput
              values={filterItens}
              onChange={setFilterItens}
              placeholder="Ex: seringa 5ml, bolsa de urina..."
              icon={<Package className="h-3.5 w-3.5" />}
              onEnterEmpty={handleSearch}
            />
          </div>
          <div className="space-y-1.5 lg:col-span-3">
            <div className="flex h-4 items-center">
              <label className="text-xs font-medium text-muted-foreground">Status (multi)</label>
            </div>
            <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-lg border border-border bg-secondary/50 p-1">
              {statusOptions.filter((o) => o.value).map((opt) => {
                const on = filterSituacoes.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() =>
                      setFilterSituacoes(on ? filterSituacoes.filter((s) => s !== opt.value) : [...filterSituacoes, opt.value])
                    }
                    className={cn(
                      "rounded-md px-2 text-xs font-medium leading-7 transition-colors",
                      on ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
              {filterSituacoes.length > 0 && (
                <button
                  onClick={() => setFilterSituacoes([])}
                  className="rounded-md px-2 text-xs leading-7 text-muted-foreground hover:text-foreground"
                >
                  limpar
                </button>
              )}
            </div>
          </div>
        </div>




        {/* Expandable filters section */}
        <div>
          <button
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            FILTROS AVANÇADOS
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", filtersExpanded && "rotate-180")} />
          </button>

          <AnimatePresence>
            {filtersExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-3 grid grid-cols-1 items-start gap-4 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-muted-foreground">Órgão(s)</label>
                    <ComboboxMultiFilter
                      values={filterOrgaos}
                      onChange={setFilterOrgaos}
                      options={orgaoOptions}
                      placeholder="Selecionar órgãos..."
                      searchPlaceholder="Buscar órgão..."
                      isLoading={orgaosLoading}
                      onServerSearch={setOrgaoSearch}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-muted-foreground">Vencedor(es)</label>
                    <ComboboxMultiFilter
                      values={filterVencedores}
                      onChange={handleWinnerFilterChange}
                      options={vencedorOptions}
                      placeholder="Selecionar vencedores..."
                      searchPlaceholder="Buscar vencedor..."
                      isLoading={vencedoresLoading}
                      onServerSearch={setVencedorSearch}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-muted-foreground">Estado(s)</label>
                    <ComboboxMultiFilter
                      values={filterUfs}
                      onChange={setFilterUfs}
                      options={UFS.map((uf) => ({ label: uf, value: uf }))}
                      placeholder="Todos os estados"
                      searchPlaceholder="Buscar UF..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-muted-foreground">Modalidade(s)</label>
                    <ComboboxMultiFilter
                      values={filterModalidades}
                      onChange={setFilterModalidades}
                      options={MODALIDADE_OPTIONS.map((m) => ({ label: m, value: m }))}
                      placeholder="Todas as modalidades"
                      searchPlaceholder="Buscar modalidade..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-muted-foreground">Ordenar por</label>
                    <Select value={filterSort} onValueChange={(v) => setFilterSort(v as typeof filterSort)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="recentes">Mais recentes</SelectItem>
                        <SelectItem value="valor">Maior valor homologado</SelectItem>
                        <SelectItem value="estimado">Maior valor estimado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-muted-foreground">Data Início</label>
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
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-muted-foreground">Data Fim</label>
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
                  {empresaId && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-muted-foreground">Minha atuação</label>
                      <label
                        htmlFor="apenas-participei"
                        className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm"
                      >
                        <input
                          id="apenas-participei"
                          type="checkbox"
                          className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                          checked={filterApenasParticipei}
                          onChange={(e) => setFilterApenasParticipei(e.target.checked)}
                        />
                        <span className="truncate">
                          Apenas onde participei
                          {minhasParticipacaoIds && (
                            <span className="ml-1 text-xs text-muted-foreground">({minhasParticipacaoIds.length})</span>
                          )}
                        </span>
                      </label>
                    </div>
                  )}
                </div>

                {filterVencedores.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {vencedorStats && (
                      <>
                        <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          <Trophy className="h-3 w-3" />
                          {vencedorStats.totalSum} vitória{vencedorStats.totalSum !== 1 ? "s" : ""} ({filterVencedores.length} empresa{filterVencedores.length > 1 ? "s" : ""})
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                          <Award className="h-3 w-3" />
                          Busca em Encerradas / Com Resultado
                        </span>
                      </>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                      Ao pesquisar por vencedor, o sistema consulta automaticamente licitações encerradas com resultado.
                    </span>
                  </div>
                )}

              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Ações */}
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          {hasActiveFilters ? (
            <Button variant="outline" onClick={handleClearFilters} className="h-9 w-full gap-2 sm:w-auto">
              <X className="h-3.5 w-3.5" />
              Limpar filtros
            </Button>
          ) : (
            <span className="hidden sm:block" />
          )}
          <Button
            onClick={handleSearch}
            disabled={isFetching}
            className="h-9 w-full gap-2 px-6 text-sm font-semibold sm:w-auto"
          >
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {isFetching ? "Pesquisando..." : "Pesquisar"}
          </Button>
        </div>

        </div>
      </div>


      {/* Search loading bar */}
      <AnimatePresence>
        {isFetching && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Pesquisando licitações...
            </div>
            <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-primary"
                animate={{ width: ["0%", "70%", "90%", "95%"] }}
                transition={{ duration: 8, ease: "easeOut" }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ingest progress bar */}
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

      {/* Aviso de resultado parcial (fallback do filtro por vencedor) */}
      {isPartial && !isLoading && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            A busca completa demorou demais. Mostrando <strong>resultados parciais</strong> do filtro por vencedor —
            os demais filtros (órgão, texto, itens) não foram aplicados nesta consulta rápida.
          </span>
        </div>
      )}

      {/* Barra de progresso durante troca de página / nova busca */}
      {isFetching && !isLoading && (
        <div className="mb-2 h-0.5 w-full overflow-hidden rounded-full bg-secondary">
          <motion.div
            className="h-full w-1/3 rounded-full bg-primary"
            animate={{ x: ["-100%", "300%"] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-lg border border-border/60 bg-card px-4 py-3">
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              <div className="h-3 flex-1 animate-pulse rounded bg-muted" />
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
              <div className="h-3 w-16 animate-pulse rounded bg-muted" />
            </div>
          ))}
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
          <Button onClick={() => { clearNamespace("licitacoes"); refetch(); }} variant="outline" className="mt-4 gap-2">
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
            {appliedFilters.vencedores.length > 0
              ? `Não há resultados para "${appliedFilters.vencedores.join(", ")}" no período selecionado. Tente ampliar o intervalo de datas para o histórico completo.`
              : "Use o menu \"Ingestão\" para buscar dados do PNCP."}
          </p>
          {appliedFilters.vencedores.length > 0 && (
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setActiveTab("encerradas");
                setFilterSituacoes([]);
                setFilterDateFrom(undefined);
                setFilterDateTo(undefined);
                setPage(0);
                setAppliedFilters((prev) => ({
                  ...prev,
                  situacoes: [],
                  tab: "encerradas",
                  dateFrom: undefined,
                  dateTo: undefined,
                }));
              }}
            >
              Ver histórico completo
            </Button>
          )}
        </motion.div>
      ) : (
        <>
          {/* Mobile: cards empilhados */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="md:hidden space-y-3"
          >
            {licitacoes.map((row: any) => {
              let pncpLink: string | null = null;
              if (row.numero_controle_pncp) {
                const match = row.numero_controle_pncp.match(/^(\d+)-\d+-(\d+)\/(\d+)$/);
                if (match) pncpLink = `https://pncp.gov.br/app/editais/${match[1]}/${match[3]}/${parseInt(match[2])}`;
              }
              const formattedDate = row.data_publicacao
                ? (() => { const [y, m, d] = row.data_publicacao.split("-"); return `${d}/${m}/${y}`; })()
                : "—";
              const economia = row.valor_estimado && row.valor_homologado
                ? row.valor_estimado - row.valor_homologado
                : null;
              return (
                <button
                  key={row.id}
                  onClick={() => openDetail(row)}
                  className="w-full text-left rounded-xl border border-border bg-card shadow-sm p-3 active:bg-secondary/40 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {pncpLink ? (
                        <a
                          href={pncpLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                        >
                          {row.orgao} <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      ) : (
                        <p className="text-xs font-semibold text-foreground line-clamp-2">{row.orgao}</p>
                      )}
                      <p className="mt-1 text-sm text-foreground line-clamp-2">{row.objeto}</p>
                    </div>
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/5 text-primary">
                      <Eye className="h-3.5 w-3.5" />
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Valor Est.</p>
                      <p className="font-medium text-foreground tabular-nums">{formatCurrency(row.valor_estimado)}</p>
                    </div>
                    {activeTab === "encerradas" ? (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Homologado</p>
                        <p className="font-medium text-success tabular-nums">{row.valor_homologado ? formatCurrency(row.valor_homologado) : "—"}</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Situação</p>
                        <div className="mt-0.5"><StatusBadge situacao={row.situacao} valorHomologado={row.valor_homologado} /></div>
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Modalidade</p>
                      <p className="text-foreground truncate">{row.modalidade || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Data / UF</p>
                      <p className="text-foreground">{formattedDate} · {row.uf || "—"}</p>
                    </div>
                    {activeTab === "encerradas" && economia !== null && (
                      <div className="col-span-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Economia</p>
                        <p className={cn("font-medium tabular-nums", economia > 0 ? "text-success" : "text-destructive")}>
                          {formatCurrency(economia)}
                        </p>
                      </div>
                    )}
                    {activeTab === "encerradas" && row.vencedor_nome && (
                      <div className="col-span-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Vencedor</p>
                        <span
                          role="button"
                          onClick={(e) => { e.stopPropagation(); searchByWinner(row.vencedor_nome); }}
                          className="block truncate text-primary text-xs font-medium hover:underline"
                        >
                          {row.vencedor_nome}
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </motion.div>

          {/* Desktop: tabela */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="hidden md:block overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="table-scroll">
              <table className="table-sticky">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground w-16"></th>
                    <th className="table-sticky-col px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Órgão</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Objeto</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Modalidade</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Valor Est.</th>
                    {activeTab === "encerradas" && (
                      <>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Val. Homologado</th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Economia</th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          <Tooltip>
                            <TooltipTrigger asChild><span className="cursor-help border-b border-dotted border-muted-foreground/40">Empenhado</span></TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs"><p className="text-xs">Valor já comprometido pelo órgão via empenho. Fonte oficial disponível apenas para órgãos federais; estaduais e municipais aparecem como <strong>n/d</strong> (sem fonte pública), não como ausência de execução.</p></TooltipContent>
                          </Tooltip>
                        </th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Vencedor</th>
                      </>
                    )}
                    {activeTab === "abertas" && (
                      <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Situação</th>
                    )}
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Data</th>
                    <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground">UF</th>
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
                    const empenhoRow = empenhosMap?.[row.id];
                    return (
                      <tr key={row.id} className="border-b border-border last:border-0 transition hover:bg-secondary/30 cursor-pointer" onClick={() => openDetail(row)}>
                        <td className="px-4 py-3">
                          <button className="flex h-7 w-7 items-center justify-center rounded-lg border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition">
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        </td>
                        <td className="table-sticky-col px-4 py-3 font-medium text-foreground max-w-[200px]">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex min-w-0 items-center gap-1">
                                {pncpLink ? (
                                  <a href={pncpLink} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex min-w-0 items-center gap-1 text-primary hover:underline">
                                    <span className="truncate">{row.orgao}</span>
                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                  </a>
                                ) : <span className="truncate">{row.orgao}</span>}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-sm"><p>{row.orgao}</p></TooltipContent>
                          </Tooltip>
                        </td>
                        <td className="px-4 py-3 max-w-[240px]">
                          <Tooltip>
                            <TooltipTrigger asChild><span className="block truncate text-foreground">{row.objeto}</span></TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-md"><p className="text-xs leading-relaxed">{row.objeto}</p></TooltipContent>
                          </Tooltip>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground text-xs">{row.modalidade || "—"}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-foreground tabular-nums">{formatCurrency(row.valor_estimado)}</td>
                        {activeTab === "encerradas" && (
                          <>
                            <td className="px-4 py-3 text-right font-medium text-success tabular-nums">{row.valor_homologado ? formatCurrency(row.valor_homologado) : "—"}</td>
                            <td className="px-4 py-3 text-right font-medium tabular-nums">
                              {row.valor_estimado && row.valor_homologado ? (
                                <span className={row.valor_estimado - row.valor_homologado > 0 ? "text-success" : "text-destructive"}>
                                  {formatCurrency(row.valor_estimado - row.valor_homologado)}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-medium tabular-nums">
                              {empenhoRow && empenhoRow.total_empenhado > 0 ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-primary cursor-help border-b border-dotted border-primary/40">
                                      {formatCurrency(empenhoRow.total_empenhado)}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="max-w-xs">
                                    <div className="text-xs space-y-1">
                                      <p><strong>{empenhoRow.qtd_empenhos}</strong> empenho{empenhoRow.qtd_empenhos > 1 ? "s" : ""}</p>
                                      <p>Empenhado: {formatCurrency(empenhoRow.total_empenhado)}</p>
                                      <p>Liquidado: {formatCurrency(empenhoRow.total_liquidado)}</p>
                                      <p>Pago: {formatCurrency(empenhoRow.total_pago)}</p>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-muted-foreground text-xs cursor-help border-b border-dotted border-muted-foreground/40">
                                      n/d
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="max-w-xs">
                                    <p className="text-xs">
                                      Empenho não disponível. A execução orçamentária só é publicada de forma
                                      aberta para órgãos federais (SIAFE/União). Órgãos estaduais e municipais
                                      não expõem esse dado — ausência aqui não significa que não houve empenho.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
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
                          </>
                        )}
                        {activeTab === "abertas" && (
                          <td className="px-4 py-3 text-center">
                            <StatusBadge situacao={row.situacao} valorHomologado={row.valor_homologado} />
                          </td>
                        )}
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground text-xs">{formattedDate}</td>
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
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-foreground leading-tight">{selectedLicitacao.orgao}</p>
                        <OrgaoScoreBadge
                          cnpj={selectedLicitacao.raw_json?.orgaoEntidade?.cnpj}
                          nome={selectedLicitacao.orgao}
                          uf={selectedLicitacao.uf}
                          showRefresh
                          size="md"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{selectedLicitacao.objeto}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge situacao={selectedLicitacao.situacao} hasWinner={detailWinners.length > 0} valorHomologado={selectedLicitacao.valor_homologado} />
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

      {/* Export confirmation dialog with filter summary and count comparison */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Confirmar exportação para Excel
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Filter summary */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">Filtros aplicados</h4>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                {appliedFiltersSummary().length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum filtro adicional aplicado.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {appliedFiltersSummary().map((f) => (
                      <Badge key={f.label} variant="secondary" className="text-xs">
                        <span className="font-medium">{f.label}:</span>
                        <span className="ml-1 font-normal">{f.value}</span>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Count comparison */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">Validação de contagem</h4>
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="grid grid-cols-3 divide-x divide-border">
                  <div className="p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pesquisa (UI)</p>
                    <p className="text-lg font-semibold text-foreground mt-1">
                      {(exportPreview?.uiCount ?? 0).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <div className="p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Calculada (Servidor)</p>
                    <p className="text-lg font-semibold text-foreground mt-1">
                      {exportPreview?.loading ? (
                        <Loader2 className="h-4 w-4 animate-spin inline" />
                      ) : exportPreview?.serverCount === null ? (
                        <span className="text-muted-foreground text-sm">indisponível</span>
                      ) : (
                        (exportPreview?.serverCount ?? 0).toLocaleString("pt-BR")
                      )}
                    </p>
                  </div>
                  <div className="p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Diferença</p>
                    <p className={cn(
                      "text-lg font-semibold mt-1",
                      exportPreview?.inconsistent ? "text-destructive" : "text-success"
                    )}>
                      {exportPreview?.loading || exportPreview?.diff === null
                        ? "—"
                        : (exportPreview?.diff ?? 0).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>
              </div>

              {exportPreview && !exportPreview.loading && (
                <p className={cn(
                  "text-xs mt-2",
                  exportPreview.inconsistent ? "text-destructive" : "text-muted-foreground"
                )}>
                  {exportPreview.inconsistent
                    ? `⚠️ Diferença acima da tolerância (${exportPreview.tolerance.toLocaleString("pt-BR")} registros). Os filtros podem estar inconsistentes.`
                    : `✓ Contagens compatíveis (tolerância: ${exportPreview.tolerance.toLocaleString("pt-BR")} registros).`}
                </p>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Limite máximo de exportação: 10.000 registros por arquivo.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setExportDialogOpen(false)} disabled={exporting}>
              Cancelar
            </Button>
            <Button onClick={exportToExcel} disabled={exporting || exportPreview?.loading}>
              {exporting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Exportando...</>
              ) : (
                <><FileSpreadsheet className="h-4 w-4 mr-2" /> Gerar arquivo</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
