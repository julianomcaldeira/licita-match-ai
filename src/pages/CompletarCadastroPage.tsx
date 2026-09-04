import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Building2, Loader2 } from "lucide-react";
import { formatCNPJ, formatCPF, isValidCNPJ, isValidCPF, onlyDigits } from "@/lib/documentValidation";

const ERROR_MESSAGES: Record<string, string> = {
  cnpj_invalido: "CNPJ inválido.",
  cpf_invalido: "CPF inválido.",
  usuario_ja_possui_empresa: "Esta conta já está vinculada a uma empresa.",
  trial_ja_utilizado: "Este CNPJ já utilizou o teste grátis antes.",
  empresa_ja_possui_assinatura: "Esta empresa já possui uma assinatura cadastrada.",
  plano_self_service_nao_encontrado: "Plano de teste indisponível no momento. Fale com o suporte.",
};

export default function CompletarCadastroPage() {
  const navigate = useNavigate();
  const { refreshRole } = useAuth();
  const [nomeEmpresa, setNomeEmpresa] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [cpf, setCpf] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValidCNPJ(cnpj)) {
      toast.error("CNPJ inválido.");
      return;
    }
    if (!isValidCPF(cpf)) {
      toast.error("CPF inválido.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.rpc("iniciar_trial_self_service", {
        p_cnpj: onlyDigits(cnpj),
        p_cpf: onlyDigits(cpf),
        p_nome_empresa: nomeEmpresa,
      });
      if (error) throw error;

      await refreshRole();
      toast.success("Teste grátis de 7 dias ativado!");
      navigate("/dashboard", { replace: true });
    } catch (error: any) {
      const message = ERROR_MESSAGES[error.message] || error.message || "Erro ao ativar o teste grátis.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="text-center">
          <Building2 className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-3 text-lg font-semibold text-foreground">Complete seu cadastro</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Últimos dados para ativar seu teste grátis de 7 dias.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Nome da empresa</label>
            <input
              type="text"
              value={nomeEmpresa}
              onChange={(e) => setNomeEmpresa(e.target.value)}
              placeholder="Razão social ou nome fantasia"
              className="h-10 w-full rounded-lg border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">CNPJ</label>
            <input
              type="text"
              value={cnpj}
              onChange={(e) => setCnpj(formatCNPJ(e.target.value))}
              placeholder="00.000.000/0000-00"
              className="h-10 w-full rounded-lg border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Seu CPF</label>
            <input
              type="text"
              value={cpf}
              onChange={(e) => setCpf(formatCPF(e.target.value))}
              placeholder="000.000.000-00"
              className="h-10 w-full rounded-lg border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Usado apenas como dado cadastral.
            </p>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground shadow hover:opacity-90 transition disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Ativar teste grátis de 7 dias
          </button>
        </form>
      </div>
    </div>
  );
}
