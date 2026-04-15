import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { motion } from "framer-motion";

export default function SancionadosAlertCard() {
  const { data: sancionados, isLoading } = useQuery({
    queryKey: ["vencedores-sancionados"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("check_vencedores_sancionados", { p_limit: 10 });
      if (error) throw error;
      return data as {
        razao_social: string;
        cnpj: string;
        tipo_cadastro: string;
        tipo_sancao: string;
        orgao_sancionador: string;
        data_inicio: string;
        data_fim: string | null;
        total_vitorias: number;
        total_valor: number;
      }[];
    },
    staleTime: 1000 * 60 * 10,
  });

  if (isLoading || !sancionados?.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 shadow-sm"
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10">
          <ShieldAlert className="h-5 w-5 text-destructive" />
        </div>
        <div>
          <h3 className="font-display text-sm font-semibold text-destructive">
            ⚠️ Vencedores com Sanções Ativas (CEIS/CNEP)
          </h3>
          <p className="text-xs text-muted-foreground">
            {sancionados.length} empresa{sancionados.length > 1 ? "s" : ""} vencedora{sancionados.length > 1 ? "s" : ""} com restrições vigentes
          </p>
        </div>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {sancionados.map((s, i) => (
          <div key={`${s.cnpj}-${s.tipo_cadastro}-${i}`} className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-card p-3">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{s.razao_social || "—"}</p>
              <p className="text-xs text-muted-foreground">CNPJ: {s.cnpj || "—"}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                  {s.tipo_cadastro}
                </span>
                {s.tipo_sancao && (
                  <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning truncate max-w-[200px]">
                    {s.tipo_sancao}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-foreground">{s.total_vitorias} vitória{s.total_vitorias > 1 ? "s" : ""}</p>
              <p className="text-xs text-muted-foreground">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(s.total_valor)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
