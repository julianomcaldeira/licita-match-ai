import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2, Save, UserCheck } from "lucide-react";

type Resultado = "venceu" | "perdeu" | "desclassificado";

interface Props {
  licitacaoId: string;
}

export default function MinhaParticipacaoBlock({ licitacaoId }: Props) {
  const { empresaId, user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["minha-participacao", licitacaoId, empresaId],
    enabled: !!empresaId && !!licitacaoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cliente_participacoes")
        .select("id, participou, proposta_centavos, resultado")
        .eq("empresa_cliente_id", empresaId!)
        .eq("licitacao_id", licitacaoId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [participou, setParticipou] = useState<"sim" | "nao">("sim");
  const [propostaStr, setPropostaStr] = useState<string>("");
  const [resultado, setResultado] = useState<Resultado | "">("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setParticipou(data.participou ? "sim" : "nao");
      setPropostaStr(
        data.proposta_centavos != null
          ? (Number(data.proposta_centavos) / 100).toString().replace(".", ",")
          : ""
      );
      setResultado((data.resultado as Resultado) || "");
    } else {
      setParticipou("sim");
      setPropostaStr("");
      setResultado("");
    }
  }, [data]);

  if (!empresaId) return null;

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const normalized = propostaStr.replace(/\./g, "").replace(",", ".").trim();
      const num = normalized ? Number(normalized) : NaN;
      const proposta_centavos =
        participou === "sim" && !isNaN(num) && num > 0 ? Math.round(num * 100) : null;

      const payload = {
        empresa_cliente_id: empresaId,
        licitacao_id: licitacaoId,
        participou: participou === "sim",
        proposta_centavos,
        resultado: participou === "sim" && resultado ? resultado : null,
      };

      const { error } = await supabase
        .from("cliente_participacoes")
        .upsert(payload, { onConflict: "empresa_cliente_id,licitacao_id" });

      if (error) throw error;
      toast({ title: "Participação salva", description: "Registro atualizado com sucesso." });
      qc.invalidateQueries({ queryKey: ["minha-participacao", licitacaoId, empresaId] });
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <UserCheck className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Minha participação</h3>
        {data && (
          <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
            Editando registro existente
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Participei desta licitação?</Label>
            <RadioGroup
              value={participou}
              onValueChange={(v) => setParticipou(v as "sim" | "nao")}
              className="flex gap-4"
            >
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="sim" id="part-sim" />
                <Label htmlFor="part-sim" className="text-sm font-normal cursor-pointer">Sim</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="nao" id="part-nao" />
                <Label htmlFor="part-nao" className="text-sm font-normal cursor-pointer">Não</Label>
              </div>
            </RadioGroup>
          </div>

          {participou === "sim" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="proposta" className="text-xs">Valor da proposta (R$) — opcional</Label>
                <Input
                  id="proposta"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={propostaStr}
                  onChange={(e) => setPropostaStr(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Resultado</Label>
                <Select value={resultado} onValueChange={(v) => setResultado(v as Resultado)}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="venceu">Venceu</SelectItem>
                    <SelectItem value="perdeu">Perdeu</SelectItem>
                    <SelectItem value="desclassificado">Foi desclassificado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {data ? "Atualizar" : "Salvar"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
