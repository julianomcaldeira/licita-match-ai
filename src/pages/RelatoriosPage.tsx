import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileDown, FileSpreadsheet, Play, X, Database, Filter, Columns3, Search, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { usePageView, useTracker } from "@/hooks/useTracking";

const EXPORT_BATCH = 1000;

type TableConfig = {
  name: string;
  label: string;
  columns: { key: string; label: string; type: string }[];
};

const TABLES: TableConfig[] = [
  {
    name: "licitacoes",
    label: "Licitações",
    columns: [
      { key: "id", label: "ID", type: "text" },
      { key: "id_origem", label: "ID Origem", type: "text" },
      { key: "orgao", label: "Órgão", type: "text" },
      { key: "objeto", label: "Objeto", type: "text" },
      { key: "modalidade", label: "Modalidade", type: "text" },
      { key: "situacao", label: "Situação", type: "text" },
      { key: "uf", label: "UF", type: "text" },
      { key: "municipio", label: "Município", type: "text" },
      { key: "valor_estimado", label: "Valor Estimado", type: "number" },
      { key: "valor_homologado", label: "Valor Homologado", type: "number" },
      { key: "data_publicacao", label: "Data Publicação", type: "date" },
      { key: "data_resultado", label: "Data Resultado", type: "date" },
      { key: "numero_controle_pncp", label: "Nº Controle PNCP", type: "text" },
      { key: "fonte", label: "Fonte", type: "text" },
      { key: "created_at", label: "Criado em", type: "date" },
    ],
  },
  {
    name: "contratos",
    label: "Contratos",
    columns: [
      { key: "id", label: "ID", type: "text" },
      { key: "numero_contrato", label: "Nº Contrato", type: "text" },
      { key: "orgao_nome", label: "Órgão", type: "text" },
      { key: "objeto", label: "Objeto", type: "text" },
      { key: "fornecedor_nome", label: "Fornecedor", type: "text" },
      { key: "fornecedor_cnpj", label: "CNPJ Fornecedor", type: "text" },
      { key: "valor_inicial", label: "Valor Inicial", type: "number" },
      { key: "valor_final", label: "Valor Final", type: "number" },
      { key: "data_assinatura", label: "Data Assinatura", type: "date" },
      { key: "data_publicacao", label: "Data Publicação", type: "date" },
      { key: "data_vigencia_inicio", label: "Vigência Início", type: "date" },
      { key: "data_vigencia_fim", label: "Vigência Fim", type: "date" },
      { key: "situacao", label: "Situação", type: "text" },
      { key: "modalidade_compra", label: "Modalidade", type: "text" },
      { key: "categoria", label: "Categoria", type: "text" },
      { key: "cnpj_orgao", label: "CNPJ Órgão", type: "text" },
    ],
  },
  {
    name: "licitacao_itens",
    label: "Itens de Licitação",
    columns: [
      { key: "id", label: "ID", type: "text" },
      { key: "licitacao_id", label: "ID Licitação", type: "text" },
      { key: "numero_item", label: "Nº Item", type: "number" },
      { key: "descricao", label: "Descrição", type: "text" },
      { key: "quantidade", label: "Quantidade", type: "number" },
      { key: "unidade", label: "Unidade", type: "text" },
      { key: "valor_unitario_estimado", label: "Valor Unit. Estimado", type: "number" },
      { key: "valor_unitario_final", label: "Valor Unit. Final", type: "number" },
    ],
  },
  {
    name: "licitacao_vencedores",
    label: "Vencedores",
    columns: [
      { key: "id", label: "ID", type: "text" },
      { key: "item_id", label: "ID Item", type: "text" },
      { key: "razao_social", label: "Razão Social", type: "text" },
      { key: "cnpj", label: "CNPJ", type: "text" },
      { key: "valor_final", label: "Valor Final", type: "number" },
      { key: "percentual_desconto", label: "% Desconto", type: "number" },
    ],
  },
  {
    name: "empresas_clientes",
    label: "Empresas Clientes",
    columns: [
      { key: "id", label: "ID", type: "text" },
      { key: "nome", label: "Nome", type: "text" },
      { key: "cnpj", label: "CNPJ", type: "text" },
      { key: "descricao_atividade", label: "Atividade", type: "text" },
      { key: "segmentos", label: "Segmentos", type: "text" },
      { key: "palavras_chave", label: "Palavras-chave", type: "text" },
    ],
  },
  {
    name: "oportunidades",
    label: "Oportunidades",
    columns: [
      { key: "id", label: "ID", type: "text" },
      { key: "empresa_id", label: "ID Empresa", type: "text" },
      { key: "licitacao_id", label: "ID Licitação", type: "text" },
      { key: "score_aderencia", label: "Score Aderência", type: "number" },
      { key: "tipo_oportunidade", label: "Tipo", type: "text" },
      { key: "nivel_risco", label: "Nível Risco", type: "text" },
      { key: "motivo_recomendacao", label: "Motivo", type: "text" },
      { key: "justificativa_tecnica", label: "Justificativa", type: "text" },
    ],
  },
  {
    name: "empresas_sancionadas",
    label: "Empresas Sancionadas (CEIS/CNEP)",
    columns: [
      { key: "id", label: "ID", type: "text" },
      { key: "cnpj_cpf", label: "CNPJ/CPF", type: "text" },
      { key: "nome", label: "Nome", type: "text" },
      { key: "tipo_cadastro", label: "Cadastro (CEIS/CNEP)", type: "text" },
      { key: "tipo_sancao", label: "Tipo Sanção", type: "text" },
      { key: "orgao_sancionador", label: "Órgão Sancionador", type: "text" },
      { key: "uf_orgao", label: "UF", type: "text" },
      { key: "data_inicio", label: "Data Início", type: "date" },
      { key: "data_fim", label: "Data Fim", type: "date" },
      { key: "fundamentacao_legal", label: "Fundamentação Legal", type: "text" },
    ],
  },
  {
    name: "diarios_oficiais",
    label: "Diários Oficiais",
    columns: [
      { key: "id", label: "ID", type: "text" },
      { key: "territory_id", label: "Cód. Município", type: "text" },
      { key: "territory_name", label: "Município", type: "text" },
      { key: "state_code", label: "UF", type: "text" },
      { key: "publication_date", label: "Data Publicação", type: "date" },
      { key: "excerpt", label: "Trecho", type: "text" },
      { key: "query_matched", label: "Termo Buscado", type: "text" },
      { key: "url", label: "URL", type: "text" },
      { key: "is_extra_edition", label: "Edição Extra", type: "text" },
    ],
  },
];

type FilterRule = {
  id: string;
  column: string;
  operator: string;
  value: string;
};

const OPERATORS: Record<string, { label: string }[]> = {
  text: [
    { label: "Contém" },
    { label: "Igual a" },
    { label: "Começa com" },
    { label: "Não contém" },
  ],
  number: [
    { label: "Igual a" },
    { label: "Maior que" },
    { label: "Menor que" },
  ],
  date: [
    { label: "Igual a" },
    { label: "Depois de" },
    { label: "Antes de" },
  ],
};

const PAGE_SIZE = 50;

type QuerySnapshot = {
  table: string;
  columns: string[];
  filters: FilterRule[];
  orderBy: string;
  orderDir: "asc" | "desc";
  page: number;
};

function buildSupabaseQuery(
  tableConfig: TableConfig,
  snap: QuerySnapshot
) {
  const selectCols =
    snap.columns.length > 0 ? snap.columns.join(",") : "*";

  let query = supabase
    .from(tableConfig.name as any)
    .select(selectCols, { count: "estimated" });

  for (const f of snap.filters) {
    if (!f.column || !f.value) continue;
    switch (f.operator) {
      case "Contém":
        query = query.ilike(f.column, `%${f.value}%`);
        break;
      case "Igual a":
        query = query.eq(f.column, f.value);
        break;
      case "Começa com":
        query = query.ilike(f.column, `${f.value}%`);
        break;
      case "Não contém":
        query = query.not(f.column, "ilike", `%${f.value}%`);
        break;
      case "Maior que":
        query = query.gt(f.column, f.value);
        break;
      case "Menor que":
        query = query.lt(f.column, f.value);
        break;
      case "Depois de":
        query = query.gte(f.column, f.value);
        break;
      case "Antes de":
        query = query.lte(f.column, f.value);
        break;
    }
  }

  if (snap.orderBy) {
    query = query.order(snap.orderBy, { ascending: snap.orderDir === "asc" });
  }

  query = query.range(
    snap.page * PAGE_SIZE,
    (snap.page + 1) * PAGE_SIZE - 1
  );

  return query;
}

export default function RelatoriosPage() {
  usePageView("relatorios");
  const track = useTracker();
  const [selectedTable, setSelectedTable] = useState("");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [orderBy, setOrderBy] = useState("");
  const [orderDir, setOrderDir] = useState<"asc" | "desc">("desc");

  // Snapshot-based: query only runs when snapshot changes (via button click)
  const [querySnap, setQuerySnap] = useState<QuerySnapshot | null>(null);

  const tableConfig = useMemo(
    () => TABLES.find((t) => t.name === selectedTable),
    [selectedTable]
  );

  const snapTableConfig = useMemo(
    () => (querySnap ? TABLES.find((t) => t.name === querySnap.table) : null),
    [querySnap]
  );

  const visibleColumns = useMemo(() => {
    if (!snapTableConfig) return [];
    if (!querySnap || querySnap.columns.length === 0) return snapTableConfig.columns;
    return snapTableConfig.columns.filter((c) => querySnap.columns.includes(c.key));
  }, [snapTableConfig, querySnap]);

  const { data, isLoading } = useQuery({
    queryKey: ["relatorio", querySnap],
    queryFn: async () => {
      if (!querySnap || !snapTableConfig) return { rows: [], count: 0 };
      const query = buildSupabaseQuery(snapTableConfig, querySnap);
      const { data: rows, count, error } = await query;
      if (error) throw error;
      return { rows: (rows || []) as Record<string, any>[], count: count || 0 };
    },
    enabled: !!querySnap,
    staleTime: 60_000,
  });

  const totalPages = Math.ceil((data?.count || 0) / PAGE_SIZE);

  function handleSelectTable(name: string) {
    setSelectedTable(name);
    setSelectedColumns([]);
    setFilters([]);
    setOrderBy("");
    setQuerySnap(null);
  }

  function toggleColumn(key: string) {
    setSelectedColumns((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function selectAllColumns() {
    if (!tableConfig) return;
    setSelectedColumns(
      selectedColumns.length === tableConfig.columns.length
        ? []
        : tableConfig.columns.map((c) => c.key)
    );
  }

  function addFilter() {
    setFilters((prev) => [
      ...prev,
      { id: crypto.randomUUID(), column: "", operator: "Contém", value: "" },
    ]);
  }

  function updateFilter(id: string, field: Partial<FilterRule>) {
    setFilters((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const updated = { ...f, ...field };
        if (field.column && tableConfig) {
          const col = tableConfig.columns.find((c) => c.key === field.column);
          if (col) {
            const ops = OPERATORS[col.type] || OPERATORS.text;
            updated.operator = ops[0].label;
          }
        }
        return updated;
      })
    );
  }

  function removeFilter(id: string) {
    setFilters((prev) => prev.filter((f) => f.id !== id));
  }

  function runQuery(pageOverride?: number) {
    if (!selectedTable) return;
    setQuerySnap({
      table: selectedTable,
      columns: [...selectedColumns],
      filters: [...filters],
      orderBy,
      orderDir,
      page: pageOverride ?? 0,
    });
  }

  function goToPage(newPage: number) {
    if (!querySnap) return;
    setQuerySnap({ ...querySnap, page: newPage });
  }

  function handleHeaderSort(colKey: string) {
    if (!querySnap) return;
    const newDir = querySnap.orderBy === colKey && querySnap.orderDir === "desc" ? "asc" : "desc";
    setOrderBy(colKey);
    setOrderDir(newDir);
    setQuerySnap({ ...querySnap, orderBy: colKey, orderDir: newDir, page: 0 });
  }

  function getColumnType(key: string) {
    return tableConfig?.columns.find((c) => c.key === key)?.type || "text";
  }

  function formatCell(value: any, type: string) {
    if (value === null || value === undefined) return "—";
    if (type === "number" && typeof value === "number")
      return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    if (type === "date" && typeof value === "string") {
      try { return new Date(value).toLocaleDateString("pt-BR"); } catch { return value; }
    }
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  const [exporting, setExporting] = useState(false);

  async function fetchAllRows(): Promise<Record<string, any>[]> {
    if (!querySnap || !snapTableConfig) return [];
    const selectCols = querySnap.columns.length > 0 ? querySnap.columns.join(",") : "*";
    let allRows: Record<string, any>[] = [];
    let from = 0;

    while (true) {
      let query = supabase
        .from(snapTableConfig.name as any)
        .select(selectCols);

      for (const f of querySnap.filters) {
        if (!f.column || !f.value) continue;
        switch (f.operator) {
          case "Contém": query = query.ilike(f.column, `%${f.value}%`); break;
          case "Igual a": query = query.eq(f.column, f.value); break;
          case "Começa com": query = query.ilike(f.column, `${f.value}%`); break;
          case "Não contém": query = query.not(f.column, "ilike", `%${f.value}%`); break;
          case "Maior que": query = query.gt(f.column, f.value); break;
          case "Menor que": query = query.lt(f.column, f.value); break;
          case "Depois de": query = query.gte(f.column, f.value); break;
          case "Antes de": query = query.lte(f.column, f.value); break;
        }
      }

      if (querySnap.orderBy) {
        query = query.order(querySnap.orderBy, { ascending: querySnap.orderDir === "asc" });
      }

      query = query.range(from, from + EXPORT_BATCH - 1);
      const { data: rows, error } = await query;
      if (error) throw error;
      if (!rows || rows.length === 0) break;
      allRows = allRows.concat(rows as Record<string, any>[]);
      if (rows.length < EXPORT_BATCH) break;
      from += EXPORT_BATCH;
    }

    return allRows;
  }

  function rowsToExportFormat(rows: Record<string, any>[]) {
    return rows.map((row) => {
      const obj: Record<string, any> = {};
      for (const col of visibleColumns) {
        obj[col.label] = row[col.key] ?? "";
      }
      return obj;
    });
  }

  async function exportCSV() {
    if (!snapTableConfig) return;
    setExporting(true);
    try {
      const allRows = await fetchAllRows();
      if (!allRows.length) { toast.error("Nenhum dado para exportar"); return; }
      const cols = visibleColumns;
      const header = cols.map((c) => c.label).join(";");
      const lines = allRows.map((row) =>
        cols.map((c) => {
          const v = row[c.key];
          if (v === null || v === undefined) return "";
          const s = String(v);
          return s.includes(";") ? `"${s}"` : s;
        }).join(";")
      );
      const csv = [header, ...lines].join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      downloadBlob(blob, `relatorio_${snapTableConfig.name}_${today()}.csv`);
      track("export", { page: "relatorios", format: "csv", table: snapTableConfig.name, rows: allRows.length });
      toast.success(`CSV exportado com ${allRows.length} registros!`);
    } catch (e: any) {
      toast.error("Erro ao exportar: " + (e.message || e));
    } finally {
      setExporting(false);
    }
  }

  async function exportXLSX() {
    if (!snapTableConfig) return;
    setExporting(true);
    try {
      const allRows = await fetchAllRows();
      if (!allRows.length) { toast.error("Nenhum dado para exportar"); return; }
      const formatted = rowsToExportFormat(allRows);
      const ws = XLSX.utils.json_to_sheet(formatted);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, snapTableConfig.label.slice(0, 31));
      const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      downloadBlob(blob, `relatorio_${snapTableConfig.name}_${today()}.xlsx`);
      track("export", { page: "relatorios", format: "xlsx", table: snapTableConfig.name, rows: allRows.length });
      toast.success(`XLSX exportado com ${allRows.length} registros!`);
    } catch (e: any) {
      toast.error("Erro ao exportar: " + (e.message || e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
        <p className="text-muted-foreground text-sm">
          Consulte e exporte dados de qualquer tabela do sistema
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Database className="h-4 w-4" /> Fonte de Dados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedTable} onValueChange={handleSelectTable}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma tabela" />
                </SelectTrigger>
                <SelectContent>
                  {TABLES.map((t) => (
                    <SelectItem key={t.name} value={t.name}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {tableConfig && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Columns3 className="h-4 w-4" /> Colunas
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={selectAllColumns}>
                    {selectedColumns.length === tableConfig.columns.length ? "Limpar" : "Todas"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2">
                    {tableConfig.columns.map((col) => (
                      <label key={col.key} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                        <Checkbox
                          checked={selectedColumns.length === 0 || selectedColumns.includes(col.key)}
                          onCheckedChange={() => toggleColumn(col.key)}
                        />
                        <span className="truncate">{col.label}</span>
                        <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0">{col.type}</Badge>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {tableConfig && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Filter className="h-4 w-4" /> Filtros
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={addFilter}>
                    + Adicionar
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {filters.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">Nenhum filtro aplicado</p>
                )}
                {filters.map((f) => {
                  const colType = getColumnType(f.column);
                  const ops = OPERATORS[colType] || OPERATORS.text;
                  return (
                    <div key={f.id} className="space-y-1.5 p-2 bg-muted/30 rounded-lg relative">
                      <button onClick={() => removeFilter(f.id)} className="absolute top-1 right-1 text-muted-foreground hover:text-destructive">
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <Select value={f.column} onValueChange={(v) => updateFilter(f.id, { column: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Coluna" /></SelectTrigger>
                        <SelectContent>
                          {tableConfig.columns.map((c) => (
                            <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={f.operator} onValueChange={(v) => updateFilter(f.id, { operator: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ops.map((op) => (
                            <SelectItem key={op.label} value={op.label}>{op.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Valor..."
                        value={f.value}
                        onChange={(e) => updateFilter(f.id, { value: e.target.value })}
                        className="h-8 text-xs"
                        type={colType === "date" ? "date" : colType === "number" ? "number" : "text"}
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {tableConfig && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Ordenação</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Select value={orderBy} onValueChange={setOrderBy}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Ordenar por..." /></SelectTrigger>
                  <SelectContent>
                    {tableConfig.columns.map((c) => (
                      <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={orderDir} onValueChange={(v) => setOrderDir(v as "asc" | "desc")}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Decrescente</SelectItem>
                    <SelectItem value="asc">Crescente</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}

          {tableConfig && (
            <Button className="w-full" onClick={() => runQuery()} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Executar Consulta
            </Button>
          )}
        </div>

        {/* Results */}
        <div className="lg:col-span-3">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-sm">Resultados</CardTitle>
                  {data && querySnap && (
                    <Badge variant="secondary" className="text-xs">
                      ~{data.count.toLocaleString("pt-BR")} registros
                    </Badge>
                  )}
                </div>
                {data?.rows?.length ? (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={exportCSV} disabled={exporting}>
                      {exporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />} CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportXLSX} disabled={exporting}>
                      {exporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-1" />} XLSX
                    </Button>
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              {!querySnap && (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <Search className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm">Selecione uma tabela e clique em "Executar Consulta"</p>
                </div>
              )}

              {isLoading && querySnap && (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              )}

              {querySnap && !isLoading && data && (
                <>
                  <ScrollArea className="w-full">
                    <div className="min-w-max">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {visibleColumns.map((col) => (
                              <TableHead
                                key={col.key}
                                className="text-xs whitespace-nowrap cursor-pointer hover:text-foreground"
                                onClick={() => handleHeaderSort(col.key)}
                              >
                                {col.label}
                                {querySnap.orderBy === col.key && (querySnap.orderDir === "asc" ? " ↑" : " ↓")}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.rows.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={visibleColumns.length} className="text-center text-muted-foreground py-10">
                                Nenhum registro encontrado
                              </TableCell>
                            </TableRow>
                          )}
                          {data.rows.map((row, i) => (
                            <TableRow key={i}>
                              {visibleColumns.map((col) => (
                                <TableCell key={col.key} className="text-xs whitespace-nowrap max-w-[300px] truncate" title={String(row[col.key] ?? "")}>
                                  {formatCell(row[col.key], col.type)}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </ScrollArea>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                      <span className="text-xs text-muted-foreground">
                        Página {(querySnap.page || 0) + 1} de {totalPages}
                      </span>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" disabled={querySnap.page === 0} onClick={() => goToPage(querySnap.page - 1)}>
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" disabled={querySnap.page >= totalPages - 1} onClick={() => goToPage(querySnap.page + 1)}>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
