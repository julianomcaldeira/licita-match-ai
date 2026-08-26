import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Radar } from "lucide-react";
import { toast } from "sonner";
import { formatCnpj } from "@/lib/utils";

type RunResult = {
  ok?: boolean;
  processed?: number;
  inserted?: number;
  winners?: number;
  notFound?: number;
  errors?: string[];
  duration_ms?: number;
  error?: string;
  details?: string;
};

export function VarreduraOrgaoTab() {
  const [cnpj, setCnpj] = useState("");
  const [anos, setAnos] = useState(String(new Date().getFullYear()));
  const [seqFrom, setSeqFrom] = useState("1");
  const [seqTo, setSeqTo] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  async function run() {
    const cleanCnpj = cnpj.replace(/\D/g, "");
    if (cleanCnpj.length !== 14) {
      toast.error("Informe um CNPJ válido (14 dígitos)");
      return;
    }
    const anosList = anos
      .split(/[,\s]+/)
      .map((a) => Number(a.trim()))
      .filter((a) => a >= 2021 && a <= 2100);
    if (anosList.length === 0) {
      toast.error("Informe ao menos um ano válido");
      return;
    }

    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("pncp-fill-gaps", {
        body: {
          mode: "orgao",
          cnpj: cleanCnpj,
          anos: anosList,
          seqFrom: Number(seqFrom) || 1,
          seqTo: seqTo ? Number(seqTo) : undefined,
        },
      });
      if (error) throw error;
      setResult(data as RunResult);
      if ((data as RunResult)?.inserted) {
        toast.success(`${(data as RunResult).inserted} licitações ingeridas`);
      } else {
        toast.info("Varredura concluída sem novas licitações");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult({ error: msg });
      toast.error("Falha na varredura: " + msg);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Radar className="h-4 w-4 text-primary" /> Varredura direcionada por órgão
          </CardTitle>
          <CardDescription>
            Força um CNPJ/ano na frente da fila de ingestão: busca sequencialmente as compras do
            órgão no PNCP, com itens e resultados, sem esperar o backlog geral.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-4 space-y-1.5">
              <Label htmlFor="vo-cnpj">CNPJ do órgão</Label>
              <Input
                id="vo-cnpj"
                className="h-9"
                placeholder="00.000.000/0000-00"
                inputMode="numeric"
                maxLength={18}
                value={cnpj}
                onChange={(e) => setCnpj(formatCnpj(e.target.value))}
              />
            </div>
            <div className="md:col-span-3 space-y-1.5">
              <Label htmlFor="vo-anos">Ano(s)</Label>
              <Input
                id="vo-anos"
                className="h-9"
                placeholder="2024, 2025"
                value={anos}
                onChange={(e) => setAnos(e.target.value)}
              />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="vo-from">Seq. inicial</Label>
              <Input
                id="vo-from"
                className="h-9"
                value={seqFrom}
                onChange={(e) => setSeqFrom(e.target.value)}
              />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="vo-to">Seq. final (opcional)</Label>
              <Input
                id="vo-to"
                className="h-9"
                placeholder="auto"
                value={seqTo}
                onChange={(e) => setSeqTo(e.target.value)}
              />
            </div>
            <div className="md:col-span-1 flex items-end">
              <Button className="h-9 w-full" onClick={run} disabled={running}>
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : "Rodar"}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Sem sequencial final, a varredura avança até encontrar 60 sequenciais inexistentes
            seguidos ou atingir o limite de tempo (~4 min por execução). Reexecute com sequencial
            inicial maior para continuar.
          </p>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resultado</CardTitle>
          </CardHeader>
          <CardContent>
            {result.error ? (
              <p className="text-sm text-destructive">
                {result.error} {result.details}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                {[
                  ["Processados", result.processed ?? 0],
                  ["Ingeridas", result.inserted ?? 0],
                  ["Vencedores", result.winners ?? 0],
                  ["Inexistentes", result.notFound ?? 0],
                  ["Duração", `${Math.round((result.duration_ms ?? 0) / 1000)}s`],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-xl font-semibold">{String(value)}</p>
                  </div>
                ))}
              </div>
            )}
            {result.errors && result.errors.length > 0 && (
              <div className="mt-4 max-h-40 overflow-auto rounded-md bg-muted p-3">
                {result.errors.map((e, i) => (
                  <p key={i} className="font-mono text-xs text-muted-foreground">
                    {e}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
