import { useState, useMemo } from "react";
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
import { Separator } from "@/components/ui/separator";
import { FileDown, Play, X, Database, Filter, Columns3, Search, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

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
];

type FilterRule = {
  id: string;
  column: string;
  operator: string;
  value: string;
};

const OPERATORS: Record<string, { label: string; types: string[] }[]> = {
  text: [
    { label: "Contém", types: ["text"] },
    { label: "Igual a", types: ["text"] },
    { label: "Começa com", types: ["text"] },
    { label: "Não contém", types: ["text"] },
  ],
  number: [
    { label: "Igual a", types: ["number"] },
    { label: "Maior que", types: ["number"] },
    { label: "Menor que", types: ["number"] },
    { label: "Entre", types: ["number"] },
  ],
  date: [
    { label: "Igual a", types: ["date"] },
    { label: "Depois de", types: ["date"] },
    { label: "Antes de", types: ["date"] },
  ],
};

const PAGE_SIZE = 50;

export default function RelatoriosPage() {
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [page, setPage] = useState(0);
  const [executeQuery, setExecuteQuery] = useState(false);
  const [orderBy, setOrderBy] = useState<string>("");
  const [orderDir, setOrderDir] = useState<"asc" | "desc">("desc");

  const tableConfig = useMemo(
    () => TABLES.find((t) => t.name === selectedTable),
    [selectedTable]
  );

  const visibleColumns = useMemo(() => {
    if (!tableConfig) return [];
    if (selectedColumns.length === 0) return tableConfig.columns;
    return tableConfig.columns.filter((c) => selectedColumns.includes(c.key));
  }, [tableConfig, selectedColumns]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["relatorio", selectedTable, selectedColumns, filters, page, orderBy, orderDir],
    queryFn: async () => {
      if (!tableConfig) return { rows: [], count: 0 };

      const selectCols =
        selectedColumns.length > 0 ? selectedColumns.join(",") : "*";

      let query = supabase
        .from(tableConfig.name as any)
        .select(selectCols, { count: "exact" });

      // Apply filters
      for (const f of filters) {
        if (!f.column || !f.value) continue;
        const col = tableConfig.columns.find((c) => c.key === f.column);
        if (!col) continue;

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

      if (orderBy) {
        query = query.order(orderBy, { ascending: orderDir === "asc" });
      }

      query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      const { data: rows, count, error } = await query;
      if (error) throw error;
      return { rows: (rows || []) as Record<string, any>[], count: count || 0 };
    },
    enabled: executeQuery && !!selectedTable,
  });

  const totalPages = Math.ceil((data?.count || 0) / PAGE_SIZE);

  function handleSelectTable(name: string) {
    setSelectedTable(name);
    setSelectedColumns([]);
    setFilters([]);
    setPage(0);
    setExecuteQuery(false);
    setOrderBy("");
  }

  function toggleColumn(key: string) {
    setSelectedColumns((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function selectAllColumns() {
    if (!tableConfig) return;
    if (selectedColumns.length === tableConfig.columns.length) {
      setSelectedColumns([]);
    } else {
      setSelectedColumns(tableConfig.columns.map((c) => c.key));
    }
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
        // Reset operator when column changes
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

  function runQuery() {
    setPage(0);
    setExecuteQuery(true);
  }

  function getColumnType(key: string) {
    return tableConfig?.columns.find((c) => c.key === key)?.type || "text";
  }

  function formatCell(value: any, type: string) {
    if (value === null || value === undefined) return "—";
    if (type === "number" && typeof value === "number") {
      return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    }
    if (type === "date" && typeof value === "string") {
      try {
        return new Date(value).toLocaleDateString("pt-BR");
      } catch {
        return value;
      }
    }
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  async function exportCSV() {
    if (!data?.rows?.length || !tableConfig) return;

    const cols = visibleColumns;
    const header = cols.map((c) => c.label).join(";");
    const rows = data.rows.map((row) =>
      cols
        .map((c) => {
          const v = row[c.key];
          if (v === null || v === undefined) return "";
          if (typeof v === "string" && v.includes(";")) return `"${v}"`;
          return String(v);
        })
        .join(";")
    );

    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio_${tableConfig.name}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado com sucesso!");
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
        {/* Sidebar - Config */}
        <div className="lg:col-span-1 space-y-4">
          {/* Table Selection */}
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
                    <SelectItem key={t.name} value={t.name}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Column Selection */}
          {tableConfig && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Columns3 className="h-4 w-4" /> Colunas
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={selectAllColumns}
                  >
                    {selectedColumns.length === tableConfig.columns.length
                      ? "Limpar"
                      : "Todas"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2">
                    {tableConfig.columns.map((col) => (
                      <label
                        key={col.key}
                        className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5"
                      >
                        <Checkbox
                          checked={
                            selectedColumns.length === 0 ||
                            selectedColumns.includes(col.key)
                          }
                          onCheckedChange={() => toggleColumn(col.key)}
                        />
                        <span className="truncate">{col.label}</span>
                        <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0">
                          {col.type}
                        </Badge>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Filters */}
          {tableConfig && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Filter className="h-4 w-4" /> Filtros
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={addFilter}
                  >
                    + Adicionar
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {filters.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Nenhum filtro aplicado
                  </p>
                )}
                {filters.map((f) => {
                  const colType = getColumnType(f.column);
                  const ops = OPERATORS[colType] || OPERATORS.text;
                  return (
                    <div key={f.id} className="space-y-1.5 p-2 bg-muted/30 rounded-lg relative">
                      <button
                        onClick={() => removeFilter(f.id)}
                        className="absolute top-1 right-1 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <Select
                        value={f.column}
                        onValueChange={(v) => updateFilter(f.id, { column: v })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Coluna" />
                        </SelectTrigger>
                        <SelectContent>
                          {tableConfig.columns.map((c) => (
                            <SelectItem key={c.key} value={c.key}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={f.operator}
                        onValueChange={(v) => updateFilter(f.id, { operator: v })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ops.map((op) => (
                            <SelectItem key={op.label} value={op.label}>
                              {op.label}
                            </SelectItem>
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

          {/* Order */}
          {tableConfig && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Ordenação</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Select value={orderBy} onValueChange={setOrderBy}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Ordenar por..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tableConfig.columns.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={orderDir} onValueChange={(v) => setOrderDir(v as "asc" | "desc")}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Decrescente</SelectItem>
                    <SelectItem value="asc">Crescente</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}

          {/* Execute */}
          {tableConfig && (
            <Button className="w-full" onClick={runQuery}>
              <Play className="h-4 w-4 mr-2" /> Executar Consulta
            </Button>
          )}
        </div>

        {/* Results */}
        <div className="lg:col-span-3">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-sm">Resultados</CardTitle>
                  {data && executeQuery && (
                    <Badge variant="secondary" className="text-xs">
                      {data.count.toLocaleString("pt-BR")} registros
                    </Badge>
                  )}
                </div>
                {data?.rows?.length ? (
                  <Button variant="outline" size="sm" onClick={exportCSV}>
                    <FileDown className="h-4 w-4 mr-1" /> Exportar CSV
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              {!executeQuery && (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <Search className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm">
                    Selecione uma tabela e clique em "Executar Consulta"
                  </p>
                </div>
              )}

              {(isLoading || isFetching) && executeQuery && (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              )}

              {executeQuery && !isLoading && !isFetching && data && (
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
                                onClick={() => {
                                  if (orderBy === col.key) {
                                    setOrderDir((d) => (d === "asc" ? "desc" : "asc"));
                                  } else {
                                    setOrderBy(col.key);
                                    setOrderDir("desc");
                                  }
                                }}
                              >
                                {col.label}
                                {orderBy === col.key && (orderDir === "asc" ? " ↑" : " ↓")}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.rows.length === 0 && (
                            <TableRow>
                              <TableCell
                                colSpan={visibleColumns.length}
                                className="text-center text-muted-foreground py-10"
                              >
                                Nenhum registro encontrado
                              </TableCell>
                            </TableRow>
                          )}
                          {data.rows.map((row, i) => (
                            <TableRow key={i}>
                              {visibleColumns.map((col) => (
                                <TableCell
                                  key={col.key}
                                  className="text-xs whitespace-nowrap max-w-[300px] truncate"
                                  title={String(row[col.key] ?? "")}
                                >
                                  {formatCell(row[col.key], col.type)}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </ScrollArea>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                      <span className="text-xs text-muted-foreground">
                        Página {page + 1} de {totalPages}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={page === 0}
                          onClick={() => setPage((p) => p - 1)}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={page >= totalPages - 1}
                          onClick={() => setPage((p) => p + 1)}
                        >
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
