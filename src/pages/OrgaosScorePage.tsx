import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Loader2, Play, Info, Search, X, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ScoreAuditDialog } from "@/components/ScoreAuditDialog";

const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

const colorByClass: Record<string, string> = {
  AAA: "bg-emerald-500", AA: "bg-emerald-500", A: "bg-green-500",
  BBB: "bg-lime-500", BB: "bg-yellow-500", B: "bg-yellow-500",
  CCC: "bg-orange-500", CC: "bg-orange-600", C: "bg-red-500", D: "bg-red-600",
};

export default function OrgaosScorePage() {
  const [uf, setUf] = useState<string>("");
  const [nome, setNome] = useState<string>("");
  const [nomeInput, setNomeInput] = useState<string>("");
  const [trust, setTrust] = useState<string>("");
  const [page, setPage] = useState(0);
  const [auditCnpj, setAuditCnpj] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["top-orgaos-score", uf, nome, trust, page],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("list_top_orgaos_score", {
        p_uf: uf || null,
        p_nome: nome || null,
        p_trust: trust || null,
        p_limit: limit,
        p_offset: page * limit,
      });
      if (error) throw error;
      return data as any[];
    },
  });

  const runBatch = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("calculate-orgao-score", {
        body: { mode: "batch", limit: 100 },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      toast({ title: "Cálculo concluído", description: `${d.processed} órgãos processados.` });
      refetch();
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const total = data?.[0]?.total_count || 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Score de Bom Pagador
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Classificação de órgãos públicos por confiabilidade de pagamento, saúde fiscal e execução de contratos.
          </p>
        </div>
        <Button onClick={() => runBatch.mutate()} disabled={runBatch.isPending}>
          {runBatch.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
          Calcular agora (lote)
        </Button>
      </div>

      <Card className="p-4 bg-primary/5 border-primary/20">
        <div className="flex gap-3 text-sm">
          <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p><strong>Como o score é calculado (0–1000):</strong></p>
            <ul className="text-muted-foreground text-xs space-y-0.5 ml-1">
              <li>• <strong>50%</strong> — % pago sobre empenhado (Portal da Transparência)</li>
              <li>• <strong>30%</strong> — Dívida consolidada / Receita corrente líquida (SICONFI/Tesouro)</li>
              <li>• <strong>20%</strong> — % contratos em dia na plataforma</li>
            </ul>
            <p className="text-xs text-muted-foreground">Atualizado automaticamente todo dia às 05:00.</p>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-3 items-center">
        <form
          className="relative flex-1 min-w-[240px] max-w-md"
          onSubmit={(e) => { e.preventDefault(); setNome(nomeInput.trim()); setPage(0); }}
        >
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={nomeInput}
            onChange={(e) => setNomeInput(e.target.value)}
            placeholder="Buscar por nome do órgão..."
            className="pl-8 pr-8 h-9"
          />
          {nomeInput && (
            <button
              type="button"
              onClick={() => { setNomeInput(""); setNome(""); setPage(0); }}
              className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </form>
        <Select value={uf || "all"} onValueChange={(v) => { setUf(v === "all" ? "" : v); setPage(0); }}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="UF" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas UFs</SelectItem>
            {UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={trust || "all"} onValueChange={(v) => { setTrust(v === "all" ? "" : v); setPage(0); }}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Confiabilidade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="confiavel">✓ Confiável</SelectItem>
            <SelectItem value="atencao">! Atenção</SelectItem>
            <SelectItem value="nao_confiavel">✕ Não confiável</SelectItem>
          </SelectContent>
        </Select>
        {(nome || uf || trust) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setNome(""); setNomeInput(""); setUf(""); setTrust(""); setPage(0); }}
          >
            Limpar filtros
          </Button>
        )}
        <div className="ml-auto flex items-center text-sm text-muted-foreground">
          <strong className="text-foreground mr-1">{total.toLocaleString("pt-BR")}</strong> órgãos com score
        </div>
      </div>


      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : !data || data.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <ShieldCheck className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum score calculado ainda.</p>
            <p className="text-xs mt-1">Clique em "Calcular agora" para começar.</p>
          </div>
        ) : (
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Órgão</TableHead>
                <TableHead className="w-20">UF</TableHead>
                <TableHead className="w-40">Confiável?</TableHead>
                <TableHead className="w-28">Score</TableHead>
                <TableHead className="text-right w-24">Contratos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r, i) => {
                const score = r.score_numerico || 0;
                const trust = r.score_classificacao === "SD"
                  ? { label: "Sem dados", color: "bg-muted text-muted-foreground", icon: "?" }
                  : score >= 700
                  ? { label: "Confiável", color: "bg-emerald-500 text-white", icon: "✓" }
                  : score >= 500
                  ? { label: "Atenção", color: "bg-yellow-500 text-white", icon: "!" }
                  : { label: "Não confiável", color: "bg-red-500 text-white", icon: "✕" };
                return (
                <TableRow key={r.cnpj_orgao}>
                  <TableCell className="text-muted-foreground text-xs">{page * limit + i + 1}</TableCell>
                  <TableCell className="font-medium text-sm">{r.nome_orgao}</TableCell>
                  <TableCell><Badge variant="secondary">{r.uf || "—"}</Badge></TableCell>
                  <TableCell>
                    <Badge className={`${trust.color} font-bold`}>{trust.icon} {trust.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{score}</span>
                      <span className="text-xs text-muted-foreground">({r.score_classificacao})</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm">{r.qtd_contratos_analisados}</TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Página {page + 1} de {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Próxima</Button>
          </div>
        </div>
      )}
    </div>
  );
}
