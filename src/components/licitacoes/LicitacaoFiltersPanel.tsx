import { AnimatePresence, motion } from "framer-motion";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Package,
  SlidersHorizontal,
  ChevronDown,
  Trophy,
  Award,
  X,
  Search,
  CalendarIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import TagInput from "@/components/TagInput";
import ComboboxMultiFilter from "@/components/ComboboxMultiFilter";
import { cn } from "@/lib/utils";

export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

export const MODALIDADE_OPTIONS = [
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

function ModeToggle({
  value,
  onChange,
}: {
  value: "all" | "any";
  onChange: (v: "all" | "any") => void;
}) {
  return (
    <div className="ml-auto flex items-center gap-0.5 rounded-md bg-secondary/70 p-0.5">
      {(["all", "any"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={cn(
            "rounded px-1.5 text-[10px] font-medium leading-4 transition-colors",
            value === m
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {m === "all" ? "TODOS" : "QUALQUER"}
        </button>
      ))}
    </div>
  );
}

export interface StatusOption {
  value: string;
  label: string;
}

export interface VencedorStats {
  items: { name: string; total: number }[];
  totalSum: number;
}

interface LicitacaoFiltersPanelProps {
  filterTermos: string[];
  setFilterTermos: (v: string[]) => void;
  filterTermosMode: "all" | "any";
  setFilterTermosMode: (v: "all" | "any") => void;
  filterItens: string[];
  setFilterItens: (v: string[]) => void;
  filterItensMode: "all" | "any";
  setFilterItensMode: (v: "all" | "any") => void;
  filterSituacoes: string[];
  setFilterSituacoes: (v: string[]) => void;
  statusOptions: StatusOption[];
  filtersExpanded: boolean;
  setFiltersExpanded: (v: boolean) => void;
  filterOrgaos: string[];
  setFilterOrgaos: (v: string[]) => void;
  orgaoOptions: { label: string; value: string }[];
  orgaosLoading: boolean;
  setOrgaoSearch: (s: string) => void;
  filterVencedores: string[];
  onWinnerFilterChange: (v: string[]) => void;
  vencedorOptions: { label: string; value: string }[];
  vencedoresLoading: boolean;
  setVencedorSearch: (s: string) => void;
  vencedorStats: VencedorStats | null | undefined;
  filterUfs: string[];
  setFilterUfs: (v: string[]) => void;
  filterModalidades: string[];
  setFilterModalidades: (v: string[]) => void;
  filterSort: "recentes" | "valor" | "estimado";
  setFilterSort: (v: "recentes" | "valor" | "estimado") => void;
  filterDateFrom: Date | undefined;
  setFilterDateFrom: (d: Date | undefined) => void;
  filterDateTo: Date | undefined;
  setFilterDateTo: (d: Date | undefined) => void;
  empresaId: string | null;
  filterApenasParticipei: boolean;
  setFilterApenasParticipei: (v: boolean) => void;
  minhasParticipacaoIds: string[] | undefined;
  hasActiveFilters: boolean | number | string | undefined;
  onClearFilters: () => void;
  onSearch: () => void;
}

export function LicitacaoFiltersPanel({
  filterTermos,
  setFilterTermos,
  filterTermosMode,
  setFilterTermosMode,
  filterItens,
  setFilterItens,
  filterItensMode,
  setFilterItensMode,
  filterSituacoes,
  setFilterSituacoes,
  statusOptions,
  filtersExpanded,
  setFiltersExpanded,
  filterOrgaos,
  setFilterOrgaos,
  orgaoOptions,
  orgaosLoading,
  setOrgaoSearch,
  filterVencedores,
  onWinnerFilterChange,
  vencedorOptions,
  vencedoresLoading,
  setVencedorSearch,
  vencedorStats,
  filterUfs,
  setFilterUfs,
  filterModalidades,
  setFilterModalidades,
  filterSort,
  setFilterSort,
  filterDateFrom,
  setFilterDateFrom,
  filterDateTo,
  setFilterDateTo,
  empresaId,
  filterApenasParticipei,
  setFilterApenasParticipei,
  minhasParticipacaoIds,
  hasActiveFilters,
  onClearFilters,
  onSearch,
}: LicitacaoFiltersPanelProps) {
  return (
    <div className="space-y-4 bg-secondary/30 p-4 sm:p-5">
      {/* Row 1: Objeto + Itens + Status — multi-seleção */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
        <div className="space-y-1.5 lg:col-span-5">
          <div className="flex h-4 items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">
              Palavras-chave (objeto)
            </label>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help text-[10px] text-muted-foreground">ⓘ</span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-xs">
                  Digite um termo e pressione <strong>Enter</strong> (ou vírgula) para adicionar vários. Escolha se a licitação precisa conter <strong>todos</strong> os termos ou <strong>qualquer um</strong>.
                </p>
              </TooltipContent>
            </Tooltip>
            <ModeToggle value={filterTermosMode} onChange={setFilterTermosMode} />
          </div>
          <TagInput
            values={filterTermos}
            onChange={setFilterTermos}
            placeholder="Ex: plataforma ead, consultoria... (Enter para adicionar)"
            onEnterEmpty={onSearch}
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
                <p className="text-xs">
                  Busca na <strong>descrição dos itens</strong>. Vários termos podem ser combinados.
                </p>
              </TooltipContent>
            </Tooltip>
            <ModeToggle value={filterItensMode} onChange={setFilterItensMode} />
          </div>
          <TagInput
            values={filterItens}
            onChange={setFilterItens}
            placeholder="Ex: seringa 5ml, bolsa de urina..."
            icon={<Package className="h-3.5 w-3.5" />}
            onEnterEmpty={onSearch}
          />
        </div>

        <div className="space-y-1.5 lg:col-span-3">
          <div className="flex h-4 items-center">
            <label className="text-xs font-medium text-muted-foreground">
              Status (multi)
            </label>
          </div>
          <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-lg border border-border bg-secondary/50 p-1">
            {statusOptions
              .filter((o) => o.value)
              .map((opt) => {
                const on = filterSituacoes.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() =>
                      setFilterSituacoes(
                        on
                          ? filterSituacoes.filter((s) => s !== opt.value)
                          : [...filterSituacoes, opt.value]
                      )
                    }
                    className={cn(
                      "rounded-md px-2 text-xs font-medium leading-7 transition-colors",
                      on
                        ? "bg-card text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
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
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", filtersExpanded && "rotate-180")}
          />
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
                  <label className="block text-xs font-medium text-muted-foreground">
                    Órgão(s)
                  </label>
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
                  <label className="block text-xs font-medium text-muted-foreground">
                    Vencedor(es)
                  </label>
                  <ComboboxMultiFilter
                    values={filterVencedores}
                    onChange={onWinnerFilterChange}
                    options={vencedorOptions}
                    placeholder="Selecionar vencedores..."
                    searchPlaceholder="Buscar vencedor..."
                    isLoading={vencedoresLoading}
                    onServerSearch={setVencedorSearch}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-muted-foreground">
                    Estado(s)
                  </label>
                  <ComboboxMultiFilter
                    values={filterUfs}
                    onChange={setFilterUfs}
                    options={UFS.map((uf) => ({ label: uf, value: uf }))}
                    placeholder="Todos os estados"
                    searchPlaceholder="Buscar UF..."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-muted-foreground">
                    Modalidade(s)
                  </label>
                  <ComboboxMultiFilter
                    values={filterModalidades}
                    onChange={setFilterModalidades}
                    options={MODALIDADE_OPTIONS.map((m) => ({ label: m, value: m }))}
                    placeholder="Todas as modalidades"
                    searchPlaceholder="Buscar modalidade..."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-muted-foreground">
                    Ordenar por
                  </label>
                  <Select
                    value={filterSort}
                    onValueChange={(v) => setFilterSort(v as typeof filterSort)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recentes">Mais recentes</SelectItem>
                      <SelectItem value="valor">Maior valor homologado</SelectItem>
                      <SelectItem value="estimado">Maior valor estimado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-muted-foreground">
                    Data Início
                  </label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "h-9 w-full justify-start text-left font-normal",
                          !filterDateFrom && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {filterDateFrom ? format(filterDateFrom, "dd/MM/yyyy") : "Selecionar..."}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={filterDateFrom}
                        onSelect={setFilterDateFrom}
                        locale={ptBR}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-muted-foreground">
                    Data Fim
                  </label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "h-9 w-full justify-start text-left font-normal",
                          !filterDateTo && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {filterDateTo ? format(filterDateTo, "dd/MM/yyyy") : "Selecionar..."}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={filterDateTo}
                        onSelect={setFilterDateTo}
                        locale={ptBR}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {empresaId && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-muted-foreground">
                      Minha atuação
                    </label>
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
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({minhasParticipacaoIds.length})
                          </span>
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
                        {vencedorStats.totalSum} vitória{vencedorStats.totalSum !== 1 ? "s" : ""} (
                        {filterVencedores.length} empresa{filterVencedores.length > 1 ? "s" : ""})
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
          <Button
            variant="outline"
            onClick={onClearFilters}
            className="h-9 w-full gap-2 sm:w-auto"
          >
            <X className="h-3.5 w-3.5" />
            Limpar filtros
          </Button>
        ) : (
          <span className="hidden sm:block" />
        )}
        <Button onClick={onSearch} className="h-9 w-full gap-2 sm:w-auto">
          <Search className="h-3.5 w-3.5" />
          Filtrar licitações
        </Button>
      </div>
    </div>
  );
}

export default LicitacaoFiltersPanel;
