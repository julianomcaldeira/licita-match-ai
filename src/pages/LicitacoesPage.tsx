import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, Loader2, Database, ChevronLeft, ChevronRight, X, Trophy, ExternalLink, ChevronDown, FileSpreadsheet, Eye, Package, Award, FileText, MapPin, DollarSign, Clock, Brain, Sparkles, Search, CalendarIcon, SlidersHorizontal } from "lucide-react";
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
import { OrgaoScoreBadge } from "@/components/OrgaoScoreBadge";
import ComboboxFilter from "@/components/ComboboxFilter";
import ComboboxMultiFilter from "@/components/ComboboxMultiFilter";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IngestaoManualButton } from "@/components/dashboard/IngestaoManualButton";
import { useAuth } from "@/contexts/AuthContext";
import { useTracker } from "@/hooks/useTracking";


const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

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
  const [activeTab, setActiveTab] = useState<"abertas" | "encerradas">("abertas");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [page, setPage] = useState(0);
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const abortRef = useRef(false);
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const isAdminCentral = role === "admin_central";
  const track = useTracker();
  usePageView("licitacoes");

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

  // Filter state
  const [filterOrgao, setFilterOrgao] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterItens, setFilterItens] = useState("");
  const defaultDateFrom = new Date(2023, 0, 1);
  const [filterDateFrom, setFilterDateFrom] = useState<Date | undefined>(defaultDateFrom);
  const [filterDateTo, setFilterDateTo] = useState<Date | undefined>();
  const [filterUf, setFilterUf] = useState("");
  const [filterSituacao, setFilterSituacao] = useState("");
  const [filterVencedores, setFilterVencedores] = useState<string[]>([]);

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


  const [appliedFilters, setAppliedFilters] = useState<{
    orgao: string; search: string; itens?: string; dateFrom?: string; dateTo?: string; uf?: string; situacao?: string; vencedor?: string; tab: "abertas" | "encerradas";
  }>({ orgao: "", search: "", dateFrom: format(defaultDateFrom, "yyyy-MM-dd"), tab: "abertas" });

  const hasWinnerFilter = filterVencedores.length > 0;

  const activateWinnerMode = () => {
    setActiveTab("encerradas");
    setFilterSituacao("");
  };

  const handleWinnerFilterChange = (values: string[]) => {
    setFilterVencedores(values);
    if (values.length > 0) activateWinnerMode();
  };

  const handleSearch = () => {
    const nextTab = hasWinnerFilter ? "encerradas" : activeTab;
    const nextSituacao = hasWinnerFilter ? "" : filterSituacao;

    setPage(0);
    if (hasWinnerFilter) {
      activateWinnerMode();
    }
    const next = {
      orgao: filterOrgao.trim(),
      search: filterSearch.trim(),
      itens: filterItens.trim() || undefined,
      dateFrom: filterDateFrom ? format(filterDateFrom, "yyyy-MM-dd") : undefined,
      dateTo: filterDateTo ? format(filterDateTo, "yyyy-MM-dd") : undefined,
      uf: filterUf || undefined,
      situacao: nextSituacao || undefined,
      vencedor: filterVencedores.length > 0 ? filterVencedores.join("||") : undefined,
      tab: nextTab,
    };
    setAppliedFilters(next);
    track("busca", {
      page: "licitacoes",
      has_search: !!next.search,
      has_itens: !!next.itens,
      has_orgao: !!next.orgao,
      has_uf: !!next.uf,
      has_situacao: !!next.situacao,
      has_vencedor: !!next.vencedor,
      has_date_range: !!(next.dateFrom || next.dateTo),
      tab: next.tab,
    });
  };

  const handleTabChange = (tab: "abertas" | "encerradas") => {
    setActiveTab(tab);
    setFilterSituacao("");
    setFilterVencedores([]);
    setPage(0);
    setAppliedFilters({
      orgao: filterOrgao.trim(),
      search: filterSearch.trim(),
      itens: filterItens.trim() || undefined,
      dateFrom: filterDateFrom ? format(filterDateFrom, "yyyy-MM-dd") : undefined,
      dateTo: filterDateTo ? format(filterDateTo, "yyyy-MM-dd") : undefined,
      uf: filterUf || undefined,
      tab: tab,
    });
  };

  const handleClearFilters = () => {
    setFilterOrgao("");
    setFilterSearch("");
    setFilterItens("");
    setFilterDateFrom(defaultDateFrom);
    setFilterDateTo(undefined);
    setFilterUf("");
    setFilterSituacao("");
    setFilterVencedores([]);
    setPage(0);
    setAppliedFilters({ orgao: "", search: "", dateFrom: format(defaultDateFrom, "yyyy-MM-dd"), tab: activeTab });
  };

  const hasActiveFilters = appliedFilters.orgao || appliedFilters.search || appliedFilters.itens || appliedFilters.dateFrom || appliedFilters.dateTo || appliedFilters.uf || appliedFilters.situacao || appliedFilters.vencedor;

  const searchByWinner = (name: string) => {
    activateWinnerMode();
    setFilterVencedores([name]);
    setDetailOpen(false);
    setPage(0);
    setAppliedFilters((prev) => ({ ...prev, vencedor: name, situacao: undefined, tab: "encerradas" }));
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

  const isAbertas = appliedFilters.vencedor ? false : appliedFilters.tab === "abertas";
  const useRpc = !!(appliedFilters.vencedor || appliedFilters.search || appliedFilters.itens);

  const { data: queryResult, isLoading, isFetching, isError, error: queryError, refetch } = useQuery({
    queryKey: ["licitacoes-all", page, appliedFilters],
    queryFn: async () => {
      const hasResultadoStatus = appliedFilters.situacao === "Concluída";

      const buildBaseQuery = () => {
        let query = supabase
          .from("licitacoes")
          .select("id, orgao, objeto, modalidade, valor_estimado, valor_homologado, data_publicacao, uf, municipio, situacao, numero_controle_pncp", { count: "estimated" })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);


        if (isAbertas) {
          query = query.order("data_publicacao", { ascending: false });
        } else {
          query = query.order("valor_homologado", { ascending: false, nullsFirst: false });
        }

        if (appliedFilters.dateFrom) {
          query = query.gte("data_publicacao", appliedFilters.dateFrom);
        }
        if (appliedFilters.dateTo) {
          query = query.lte("data_publicacao", appliedFilters.dateTo);
        }
        if (appliedFilters.uf) {
          query = query.eq("uf", appliedFilters.uf);
        }

        if (isAbertas) {
          if (appliedFilters.situacao) {
            query = query.eq("situacao", appliedFilters.situacao);
          }
          query = query.or("valor_homologado.is.null,valor_homologado.eq.0");
          query = query.not("situacao", "in", "(Revogada,Anulada)");
        } else {
          if (hasResultadoStatus) {
            query = query.not("valor_homologado", "is", null).gt("valor_homologado", 0);
          } else if (appliedFilters.situacao) {
            query = query.eq("situacao", appliedFilters.situacao);
          } else {
            query = query.or("valor_homologado.gt.0,situacao.in.(Revogada,Anulada)");
          }
        }

        if (appliedFilters.orgao) {
          query = query.ilike("orgao", `%${appliedFilters.orgao}%`);
        }

        return query;
      };

      if (useRpc) {
        // For "abertas" tab, force situacao to open statuses if no specific status selected
        const rpcSituacao = isAbertas
          ? (appliedFilters.situacao || null)
          : (hasResultadoStatus ? null : appliedFilters.situacao || null);

        try {
          const rpcPromise = (supabase as any).rpc("search_licitacoes", {
            p_search: appliedFilters.search || null,
            p_orgao: appliedFilters.orgao || null,
            p_date_from: appliedFilters.dateFrom || null,
            p_date_to: appliedFilters.dateTo || null,
            p_uf: appliedFilters.uf || null,
            p_situacao: rpcSituacao,
            p_vencedor: appliedFilters.vencedor || null,
            p_modalidade: null,
            p_com_vencedor: !isAbertas && hasResultadoStatus,
            p_sem_resultado: isAbertas,
            p_limit: PAGE_SIZE + 1,
            p_offset: page * PAGE_SIZE,
            p_itens: appliedFilters.itens || null,
          });
          const rpcResult = await withTimeout<{ data: any[] | null; error: any }>(
            rpcPromise as PromiseLike<{ data: any[] | null; error: any }>,
            QUERY_TIMEOUT_MS,
            "A busca demorou demais no modo avançado."
          );
          const { data, error } = rpcResult;
          if (error) throw error;

          const fetchedRows = (data || []) as any[];
          const hasMore = fetchedRows.length > PAGE_SIZE;
          const rows = hasMore ? fetchedRows.slice(0, PAGE_SIZE) : fetchedRows;
          const rpcTotal = Number(rows[0]?.total_count ?? fetchedRows[0]?.total_count ?? 0);
          const totalCount = rpcTotal > 0
            ? rpcTotal
            : (hasMore ? (page + 2) * PAGE_SIZE + 1 : page * PAGE_SIZE + rows.length);

          return { rows, totalCount };

        } catch (rpcError) {
          console.error("search_licitacoes falhou, usando fallback:", rpcError);

          let fallbackQuery = buildBaseQuery();

          const words = (appliedFilters.search || "").toLowerCase().split(/\s+/).filter(Boolean);
          for (const word of words) {
            fallbackQuery = fallbackQuery.ilike("objeto", `%${word}%`);
          }

          if (appliedFilters.vencedor) {
            const winnersPromise = supabase
              .from("licitacao_vencedores")
              .select("licitacao_id")
              .ilike("razao_social", `%${appliedFilters.vencedor}%`)
              .limit(800);

            const winnersResult = await withTimeout<{ data: { licitacao_id: string | null }[] | null; error: any }>(
              winnersPromise as PromiseLike<{ data: { licitacao_id: string | null }[] | null; error: any }>,
              8_000,
              "A busca por vencedor demorou demais."
            );
            const { data: winnerRows, error: winnerError } = winnersResult;

            if (winnerError) throw rpcError;

            const licitacaoIds = [
              ...new Set(
                (winnerRows || [])
                  .map((row) => row.licitacao_id)
                  .filter((id): id is string => typeof id === "string" && id.length > 0)
              ),
            ].slice(0, 150);
            if (licitacaoIds.length === 0) {
              return { rows: [], totalCount: 0 };
            }

            fallbackQuery = fallbackQuery.in("id", licitacaoIds);
          }

          const fallbackResult = await withTimeout<{ data: any[] | null; error: any; count?: number | null }>(
            fallbackQuery as PromiseLike<{ data: any[] | null; error: any; count?: number | null }>,
            QUERY_TIMEOUT_MS,
            "A busca de fallback demorou demais."
          );
          const { data: fallbackRows, error: fallbackError, count: fallbackCount } = fallbackResult;
          if (fallbackError) {
            throw rpcError;
          }

          const fetchedRows = (fallbackRows || []) as any[];
          const rows = fetchedRows.slice(0, PAGE_SIZE);
          const totalCount = typeof fallbackCount === "number" && fallbackCount >= 0
            ? fallbackCount
            : (fetchedRows.length > PAGE_SIZE ? (page + 2) * PAGE_SIZE + 1 : page * PAGE_SIZE + rows.length);

          return { rows, totalCount };
        }
      }

      const query = buildBaseQuery();
      const queryResult = await withTimeout<{ data: any[] | null; error: any; count?: number | null }>(
        query as PromiseLike<{ data: any[] | null; error: any; count?: number | null }>,
        QUERY_TIMEOUT_MS
      );
      const { data, error, count } = queryResult;
      if (error) throw error;

      const fetchedRows = (data || []) as any[];
      const rows = fetchedRows.slice(0, PAGE_SIZE);
      const totalCount = typeof count === "number" && count >= 0
        ? count
        : (fetchedRows.length > PAGE_SIZE ? (page + 2) * PAGE_SIZE + 1 : page * PAGE_SIZE + rows.length);

      return { rows, totalCount };

    },
    placeholderData: (prev) => prev,
    staleTime: 60_000,
    retry: 0,
    retryDelay: 2000,
    refetchOnWindowFocus: false,
  });

  const licitacoes = queryResult?.rows || [];
  const totalCount = queryResult?.totalCount || 0;
  const hasData = licitacoes.length > 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

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
    if (appliedFilters.search) items.push({ label: "Palavra-chave", value: appliedFilters.search });
    if (appliedFilters.itens) items.push({ label: "Itens", value: appliedFilters.itens });
    if (appliedFilters.orgao) items.push({ label: "Órgão", value: appliedFilters.orgao });
    if (appliedFilters.uf) items.push({ label: "UF", value: appliedFilters.uf });
    if (appliedFilters.situacao) items.push({ label: "Situação", value: appliedFilters.situacao });
    if (appliedFilters.vencedor) items.push({ label: "Vencedor", value: appliedFilters.vencedor.split("||").join(", ") });
    if (appliedFilters.dateFrom) items.push({ label: "Data inicial", value: appliedFilters.dateFrom });
    if (appliedFilters.dateTo) items.push({ label: "Data final", value: appliedFilters.dateTo });
    return items;
  }, [appliedFilters]);

  // Compute server-side count using the same filter logic as the export
  const computeExportCount = useCallback(async (): Promise<number | null> => {
    const MAX_EXPORT = 10000;
    const hasResultadoStatus = appliedFilters.situacao === "Concluída";
    const useRpcExport = !!(appliedFilters.vencedor || appliedFilters.search || appliedFilters.itens);
    try {
      if (useRpcExport) {
        const rpcSituacao = isAbertas
          ? (appliedFilters.situacao || null)
          : (hasResultadoStatus ? null : appliedFilters.situacao || null);
        const probeBatch = 1000;
        let probed = 0;
        let off = 0;
        let more = true;
        while (more && probed <= MAX_EXPORT) {
          const { data, error } = await (supabase as any).rpc("search_licitacoes", {
            p_search: appliedFilters.search || null,
            p_orgao: appliedFilters.orgao || null,
            p_date_from: appliedFilters.dateFrom || null,
            p_date_to: appliedFilters.dateTo || null,
            p_uf: appliedFilters.uf || null,
            p_situacao: rpcSituacao,
            p_vencedor: appliedFilters.vencedor || null,
            p_modalidade: null,
            p_com_vencedor: !isAbertas && hasResultadoStatus,
            p_sem_resultado: isAbertas,
            p_limit: probeBatch,
            p_offset: off,
            p_itens: appliedFilters.itens || null,
          });
          if (error) throw error;
          const n = (data || []).length;
          probed += n;
          more = n === probeBatch;
          off += probeBatch;
        }
        return probed;
      } else {
        let cq = supabase
          .from("licitacoes")
          .select("id", { count: "exact", head: true });
        if (appliedFilters.dateFrom) cq = cq.gte("data_publicacao", appliedFilters.dateFrom);
        if (appliedFilters.dateTo) cq = cq.lte("data_publicacao", appliedFilters.dateTo);
        if (appliedFilters.uf) cq = cq.eq("uf", appliedFilters.uf);
        if (isAbertas) {
          if (appliedFilters.situacao) cq = cq.eq("situacao", appliedFilters.situacao);
          cq = cq.or("valor_homologado.is.null,valor_homologado.eq.0");
          cq = cq.not("situacao", "in", "(Revogada,Anulada)");
        } else {
          if (hasResultadoStatus) {
            cq = cq.not("valor_homologado", "is", null).gt("valor_homologado", 0);
          } else if (appliedFilters.situacao) {
            cq = cq.eq("situacao", appliedFilters.situacao);
          } else {
            cq = cq.or("valor_homologado.gt.0,situacao.in.(Revogada,Anulada)");
          }
        }
        if (appliedFilters.orgao) cq = cq.ilike("orgao", `%${appliedFilters.orgao}%`);
        const { count, error } = await cq;
        if (error) throw error;
        return count || 0;
      }
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
      const hasResultadoStatus = appliedFilters.situacao === "Concluída";
      const useRpcExport = !!(appliedFilters.vencedor || appliedFilters.search || appliedFilters.itens);

      // Build a filtered base query (mirrors buildBaseQuery in main fetch, no pagination)
      const buildFilteredQuery = (from: number, to: number) => {
        let q = supabase
          .from("licitacoes")
          .select("orgao, objeto, modalidade, valor_estimado, valor_homologado, data_publicacao, uf, municipio, situacao")
          .range(from, to);

        if (isAbertas) {
          q = q.order("data_publicacao", { ascending: false });
        } else {
          q = q.order("valor_homologado", { ascending: false, nullsFirst: false });
        }

        if (appliedFilters.dateFrom) q = q.gte("data_publicacao", appliedFilters.dateFrom);
        if (appliedFilters.dateTo) q = q.lte("data_publicacao", appliedFilters.dateTo);
        if (appliedFilters.uf) q = q.eq("uf", appliedFilters.uf);

        if (isAbertas) {
          if (appliedFilters.situacao) q = q.eq("situacao", appliedFilters.situacao);
          q = q.or("valor_homologado.is.null,valor_homologado.eq.0");
          q = q.not("situacao", "in", "(Revogada,Anulada)");
        } else {
          if (hasResultadoStatus) {
            q = q.not("valor_homologado", "is", null).gt("valor_homologado", 0);
          } else if (appliedFilters.situacao) {
            q = q.eq("situacao", appliedFilters.situacao);
          } else {
            q = q.or("valor_homologado.gt.0,situacao.in.(Revogada,Anulada)");
          }
        }

        if (appliedFilters.orgao) q = q.ilike("orgao", `%${appliedFilters.orgao}%`);

        const words = (appliedFilters.search || "").toLowerCase().split(/\s+/).filter(Boolean);
        for (const word of words) q = q.ilike("objeto", `%${word}%`);

        return q;
      };

      let allData: any[] = [];

      if (useRpcExport) {
        const rpcSituacao = isAbertas
          ? (appliedFilters.situacao || null)
          : (hasResultadoStatus ? null : appliedFilters.situacao || null);

        let offset = 0;
        let hasMore = true;
        while (hasMore && allData.length < MAX_EXPORT) {
          const { data, error } = await (supabase as any).rpc("search_licitacoes", {
            p_search: appliedFilters.search || null,
            p_orgao: appliedFilters.orgao || null,
            p_date_from: appliedFilters.dateFrom || null,
            p_date_to: appliedFilters.dateTo || null,
            p_uf: appliedFilters.uf || null,
            p_situacao: rpcSituacao,
            p_vencedor: appliedFilters.vencedor || null,
            p_modalidade: null,
            p_com_vencedor: !isAbertas && hasResultadoStatus,
            p_sem_resultado: isAbertas,
            p_limit: batchSize,
            p_offset: offset,
            p_itens: appliedFilters.itens || null,
          });
          if (error) throw error;
          const rows = (data || []) as any[];
          allData = allData.concat(rows);
          hasMore = rows.length === batchSize;
          offset += batchSize;
        }
      } else {
        let offset = 0;
        let hasMore = true;
        while (hasMore && allData.length < MAX_EXPORT) {
          const { data, error } = await buildFilteredQuery(offset, offset + batchSize - 1);
          if (error) throw error;
          const rows = (data || []) as any[];
          allData = allData.concat(rows);
          hasMore = rows.length === batchSize;
          offset += batchSize;
        }
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Licitações</h1>
          <p className="text-sm text-muted-foreground">
            {activeTab === "abertas" ? "Abertas · Mais recentes primeiro" : "Encerradas · Ordenadas por maior valor"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openExportDialog} disabled={exporting || !hasData} className="flex h-9 items-center gap-2 rounded-lg border border-input bg-card px-3 text-xs font-medium text-muted-foreground hover:bg-secondary transition disabled:opacity-50">
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
            Exportar Excel
          </button>
          {isAdminCentral && <IngestaoManualButton />}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => handleTabChange(v as "abertas" | "encerradas")} className="w-full">
        <TabsList className="w-full max-w-lg">
          <TabsTrigger value="abertas" className="flex-1 gap-2">
            <Clock className="h-4 w-4" />
            Abertas / Em Andamento
            {tabCounts && <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{tabCounts.abertas.toLocaleString("pt-BR")}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="encerradas" className="flex-1 gap-2">
            <Award className="h-4 w-4" />
            Encerradas / Com Resultado
            {tabCounts && <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{tabCounts.encerradas.toLocaleString("pt-BR")}</Badge>}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Totalizador de auditoria */}
      {tabCounts && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Database className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Total Geral</p>
              <p className="text-xl font-bold text-foreground">{(tabCounts.abertas + tabCounts.encerradas).toLocaleString("pt-BR")}</p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10">
              <Clock className="h-5 w-5 text-info" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Abertas</p>
              <p className="text-xl font-bold text-foreground">{tabCounts.abertas.toLocaleString("pt-BR")}</p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <Award className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Encerradas</p>
              <p className="text-xl font-bold text-foreground">{tabCounts.encerradas.toLocaleString("pt-BR")}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        {/* Row 1: Objeto + Itens + Status */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_auto] gap-4 items-end">
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <label className="text-xs font-medium text-muted-foreground">Palavra-chave (objeto)</label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-4 w-4 p-0 hover:bg-transparent">
                    <span className="text-[10px] text-muted-foreground cursor-help">ⓘ</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">Busca no <strong>objeto</strong> (título) da licitação. Ex: "aquisição medicamentos".</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Input
              placeholder="Ex: plataforma ead, consultoria..."
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <label className="text-xs font-medium text-muted-foreground">Itens</label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-4 w-4 p-0 hover:bg-transparent">
                    <span className="text-[10px] text-muted-foreground cursor-help">ⓘ</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">Busca na <strong>descrição dos itens</strong> da licitação. Use espaços para exigir todas as palavras (AND). Ex: "seringa descartável 5ml".</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="relative">
              <Package className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Ex: notebook, seringa 5ml, cadeira..."
                value={filterItens}
                onChange={(e) => setFilterItens(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="h-9 pl-8"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <div className="flex flex-wrap gap-1.5">
              {statusOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFilterSituacao(opt.value)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium border transition-colors",
                    filterSituacao === opt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:bg-secondary hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-3 pt-3">
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
                    <label className="text-xs font-medium text-muted-foreground">Vencedor(es)</label>
                    <ComboboxMultiFilter
                      values={filterVencedores}
                      onChange={handleWinnerFilterChange}
                      options={vencedorOptions}
                      placeholder="Selecionar vencedores..."
                      searchPlaceholder="Buscar vencedor..."
                      isLoading={vencedoresLoading}
                      onServerSearch={setVencedorSearch}
                    />
                    {filterVencedores.length > 0 && vencedorStats && (
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          <Trophy className="h-3 w-3" />
                          {vencedorStats.totalSum} vitória{vencedorStats.totalSum !== 1 ? "s" : ""} ({filterVencedores.length} empresa{filterVencedores.length > 1 ? "s" : ""})
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 border border-success/20 px-2 py-0.5 text-[10px] font-semibold text-success">
                          <Award className="h-3 w-3" />
                          Busca em Encerradas / Com Resultado
                        </span>
                      </div>
                    )}
                    {filterVencedores.length > 0 && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Ao pesquisar por vencedor, o sistema consulta automaticamente licitações encerradas com resultado.
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Search + Clear buttons */}
        <div className="flex flex-col-reverse gap-2 pt-3 border-t border-border sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:pt-1">
          {hasActiveFilters ? (
            <Button
              variant="outline"
              onClick={handleClearFilters}
              className="h-10 w-full gap-2 sm:h-9 sm:w-auto"
            >
              <X className="h-3.5 w-3.5" />
              Limpar filtros
            </Button>
          ) : (
            <span className="hidden sm:block" />
          )}
          <Button
            onClick={handleSearch}
            disabled={isFetching}
            className="h-11 w-full gap-2 px-6 text-sm font-semibold sm:h-9 sm:w-auto sm:text-sm"
          >
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {isFetching ? "Pesquisando..." : "Pesquisar"}
          </Button>
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
            {appliedFilters.vencedor
              ? `Não há resultados para "${appliedFilters.vencedor}" no período selecionado. Tente ampliar o intervalo de datas para o histórico completo.`
              : "Use o menu \"Ingestão\" para buscar dados do PNCP."}
          </p>
          {appliedFilters.vencedor && (
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setActiveTab("encerradas");
                setFilterSituacao("");
                setFilterDateFrom(undefined);
                setFilterDateTo(undefined);
                setPage(0);
                setAppliedFilters((prev) => ({
                  ...prev,
                  situacao: undefined,
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
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground w-16"></th>
                    <th className="table-sticky-col px-4 py-3 text-left font-medium text-muted-foreground">Órgão</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Objeto</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Modalidade</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Valor Est.</th>
                    {activeTab === "encerradas" && (
                      <>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground">Val. Homologado</th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground">Economia</th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                          <Tooltip>
                            <TooltipTrigger asChild><span className="cursor-help border-b border-dotted border-muted-foreground/40">Empenhado</span></TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs"><p className="text-xs">Valor já comprometido pelo órgão via empenho (Portal da Transparência — federal). Só populado para contratos de fornecedores cadastrados como clientes.</p></TooltipContent>
                          </Tooltip>
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Vencedor</th>
                      </>
                    )}
                    {activeTab === "abertas" && (
                      <th className="px-4 py-3 text-center font-medium text-muted-foreground">Situação</th>
                    )}
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
                    const empenhoRow = empenhosMap?.[row.id];
                    return (
                      <tr key={row.id} className="border-b border-border last:border-0 transition hover:bg-secondary/30 cursor-pointer" onClick={() => openDetail(row)}>
                        <td className="px-4 py-3">
                          <button className="flex h-7 w-7 items-center justify-center rounded-lg border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition">
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        </td>
                        <td className="table-sticky-col px-4 py-3 font-medium text-foreground max-w-[220px]">
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
                                <span className="text-muted-foreground">—</span>
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
