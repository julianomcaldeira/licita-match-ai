import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, Search, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { motion } from "framer-motion";

export default function SancionadasPage() {
  const [search, setSearch] = useState("");
  const [cnpjCheck, setCnpjCheck] = useState("");
  const [checkResult, setCheckResult] = useState<null | { found: boolean; records: any[] }>(null);

  const { data: sancionadas, isLoading } = useQuery({
    queryKey: ["sancionadas-list", search],
    queryFn: async () => {
      let q = supabase.from("empresas_sancionadas")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (search.trim()) {
        const term = search.trim();
        const isNumeric = /^\d/.test(term.replace(/[.\-\/]/g, ""));
        if (isNumeric) {
          q = q.ilike("cnpj_cpf", `%${term}%`);
        } else {
          q = q.ilike("nome", `%${term}%`);
        }
      }

      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

  const handleCheck = async () => {
    const clean = cnpjCheck.replace(/[.\-\/\s]/g, "");
    if (clean.length < 8) return;

    const { data } = await supabase
      .from("empresas_sancionadas")
      .select("*")
      .ilike("cnpj_cpf", `%${clean}%`);

    setCheckResult({ found: (data?.length ?? 0) > 0, records: data || [] });
  };

  const activeCount = useMemo(() =>
    sancionadas?.filter(s => !s.data_fim || new Date(s.data_fim) >= new Date()).length ?? 0,
    [sancionadas]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-destructive" />
          Empresas Sancionadas (CEIS/CNEP)
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Consulte empresas com restrições nos cadastros CEIS e CNEP do Portal da Transparência
        </p>
      </div>

      {/* Quick CNPJ check */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="font-display text-sm font-semibold text-foreground mb-3">
          Verificação Rápida de CNPJ
        </h2>
        <div className="flex gap-2 max-w-lg">
          <Input
            placeholder="Digite o CNPJ para verificar..."
            value={cnpjCheck}
            onChange={e => { setCnpjCheck(e.target.value); setCheckResult(null); }}
            onKeyDown={e => e.key === "Enter" && handleCheck()}
            className="font-mono"
            maxLength={20}
          />
          <Button onClick={handleCheck} disabled={cnpjCheck.replace(/\D/g, "").length < 8}>
            Verificar
          </Button>
        </div>

        {checkResult && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            className="mt-4">
            {checkResult.found ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  <span className="font-semibold text-destructive">
                    ⚠️ CNPJ encontrado em {checkResult.records.length} registro(s)
                  </span>
                </div>
                <div className="space-y-2">
                  {checkResult.records.map((r, i) => (
                    <div key={i} className="text-sm text-foreground">
                      <span className="font-medium">{r.nome}</span> — {r.tipo_cadastro}
                      {r.tipo_sancao && ` (${r.tipo_sancao})`}
                      {r.data_fim && (
                        <span className="text-muted-foreground"> · até {new Date(r.data_fim).toLocaleDateString("pt-BR")}</span>
                      )}
                      {!r.data_fim && <Badge variant="destructive" className="ml-2 text-[10px]">Vigente</Badge>}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-success/30 bg-success/5 p-4 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span className="font-medium text-success">CNPJ não encontrado nos cadastros CEIS/CNEP</span>
              </div>
            )}
          </motion.div>
        )}
      </motion.div>

      {/* Search + table */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-display text-sm font-semibold text-foreground">
            Lista de Sancionados
            {sancionadas && (
              <span className="text-muted-foreground font-normal ml-2">
                ({sancionadas.length} resultados · {activeCount} vigentes)
              </span>
            )}
          </h2>
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou CNPJ..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
              maxLength={100}
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>CNPJ/CPF</TableHead>
                <TableHead>Cadastro</TableHead>
                <TableHead>Sanção</TableHead>
                <TableHead>Órgão Sancionador</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Fim</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : !sancionadas?.length ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum resultado encontrado</TableCell></TableRow>
              ) : sancionadas.map(s => {
                const vigente = !s.data_fim || new Date(s.data_fim) >= new Date();
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium max-w-[200px] truncate">{s.nome}</TableCell>
                    <TableCell className="font-mono text-xs">{s.cnpj_cpf || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={s.tipo_cadastro === "CEIS" ? "destructive" : "secondary"} className="text-[10px]">
                        {s.tipo_cadastro}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-xs">{s.tipo_sancao || "—"}</TableCell>
                    <TableCell className="max-w-[180px] truncate text-xs">{s.orgao_sancionador || "—"}</TableCell>
                    <TableCell className="text-xs">{s.data_inicio ? new Date(s.data_inicio).toLocaleDateString("pt-BR") : "—"}</TableCell>
                    <TableCell className="text-xs">{s.data_fim ? new Date(s.data_fim).toLocaleDateString("pt-BR") : "—"}</TableCell>
                    <TableCell>
                      {vigente ? (
                        <Badge variant="destructive" className="text-[10px]">Vigente</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">Expirada</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
