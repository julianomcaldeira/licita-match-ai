import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function toBR(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function isoToBR(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function IngerirContratosDialog() {
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  const [open, setOpen] = useState(false);
  const [dataInicial, setDataInicial] = useState(sevenDaysAgo.toISOString().slice(0, 10));
  const [dataFinal, setDataFinal] = useState(today.toISOString().slice(0, 10));
  const [maxPages, setMaxPages] = useState(50);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!dataInicial || !dataFinal) {
      toast.error("Informe ambas as datas");
      return;
    }
    if (dataInicial > dataFinal) {
      toast.error("Data inicial não pode ser maior que a final");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ingest-contratos", {
        body: {
          mode: "bulk-contratos",
          dataInicial: isoToBR(dataInicial),
          dataFinal: isoToBR(dataFinal),
          maxPages,
        },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(
          `Ingestão concluída: ${data.totalProcessed?.toLocaleString("pt-BR") ?? 0} contratos em ${data.pages ?? 0} página(s)`,
          { duration: 6000 }
        );
        setOpen(false);
      } else {
        toast.error(data?.error || "Falha na ingestão");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" size="sm" className="gap-2">
          <Download className="h-4 w-4" /> Ingerir Contratos
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ingerir Contratos (Portal da Transparência)</DialogTitle>
          <DialogDescription>
            Busca em massa de contratos federais por período. A operação pode levar alguns minutos
            em janelas grandes (limite de 500 contratos por página).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dt-ini">Data inicial</Label>
              <Input id="dt-ini" type="date" value={dataInicial} onChange={(e) => setDataInicial(e.target.value)} disabled={loading} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dt-fim">Data final</Label>
              <Input id="dt-fim" type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} disabled={loading} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="max-pages">Máximo de páginas (500 contratos cada)</Label>
            <Input
              id="max-pages"
              type="number"
              min={1}
              max={200}
              value={maxPages}
              onChange={(e) => setMaxPages(Math.max(1, Math.min(200, Number(e.target.value) || 50)))}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">Padrão: 50 (até 25.000 contratos por execução)</p>
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <strong className="text-foreground">Período:</strong> {toBR(new Date(dataInicial))} → {toBR(new Date(dataFinal))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading} className="gap-2">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Ingerindo…</> : <><Download className="h-4 w-4" /> Iniciar ingestão</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
