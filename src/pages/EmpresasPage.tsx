import { useState } from "react";
import { motion } from "framer-motion";
import { Building2, Zap, Plus, Loader2, X, Pencil, RefreshCw, Trophy, FileText, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface EmpresaForm {
  nome: string;
  cnpj: string;
  descricao_atividade: string;
  segmentos: string;
  palavras_chave: string;
  prompt_personalizado: string;
}

const emptyForm: EmpresaForm = {
  nome: "",
  cnpj: "",
  descricao_atividade: "",
  segmentos: "",
  palavras_chave: "",
  prompt_personalizado: "",
};

export default function EmpresasPage() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EmpresaForm>(emptyForm);
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = role === "admin_central";

  const { data: empresas, isLoading } = useQuery({
    queryKey: ["empresas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empresas_clientes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: vinculosByEmpresa } = useQuery({
    queryKey: ["empresas-vinculos-count"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cliente_vinculos")
        .select("empresa_id, tipo");
      if (error) throw error;
      const map: Record<string, { vitorias: number; contratos: number }> = {};
      (data || []).forEach((r: any) => {
        if (!map[r.empresa_id]) map[r.empresa_id] = { vitorias: 0, contratos: 0 };
        if (r.tipo === "licitacao_vencedor") map[r.empresa_id].vitorias++;
        else if (r.tipo === "contrato") map[r.empresa_id].contratos++;
      });
      return map;
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async (empresaId: string) => {
      const { data, error } = await supabase.rpc("refresh_cliente_vinculos", { p_empresa_id: empresaId });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      const v = data?.vitorias_inseridas ?? 0;
      const c = data?.contratos_inseridos ?? 0;
      toast.success(`Vínculos atualizados: +${v} vitórias, +${c} contratos`);
      queryClient.invalidateQueries({ queryKey: ["empresas-vinculos-count"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (emp: any) => {
    setEditingId(emp.id);
    setForm({
      nome: emp.nome ?? "",
      cnpj: emp.cnpj ?? "",
      descricao_atividade: emp.descricao_atividade ?? "",
      segmentos: (emp.segmentos ?? []).join(", "),
      palavras_chave: (emp.palavras_chave ?? []).join(", "),
      prompt_personalizado: emp.prompt_personalizado ?? "",
    });
    setShowForm(true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveMutation = useMutation({
    mutationFn: async (f: EmpresaForm) => {
      const payload = {
        nome: f.nome,
        cnpj: f.cnpj || null,
        descricao_atividade: f.descricao_atividade || null,
        segmentos: f.segmentos ? f.segmentos.split(",").map((s) => s.trim()).filter(Boolean) : [],
        palavras_chave: f.palavras_chave ? f.palavras_chave.split(",").map((s) => s.trim()).filter(Boolean) : [],
        prompt_personalizado: f.prompt_personalizado || null,
      };
      if (editingId) {
        const { error } = await supabase.from("empresas_clientes").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("empresas_clientes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Empresa atualizada!" : "Empresa criada!");
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["empresas"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("empresas_clientes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Empresa removida");
      queryClient.invalidateQueries({ queryKey: ["empresas"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Empresas</h1>
          <p className="text-sm text-muted-foreground">
            {empresas?.length ? `${empresas.length} empresas cadastradas` : "Gestão de clientes da plataforma"}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => (showForm ? resetForm() : setShowForm(true))}
            className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:opacity-90 transition"
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? "Cancelar" : "Nova Empresa"}
          </button>
        )}
      </div>

      {showForm && (
        <motion.form
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }}
          className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-foreground">
              {editingId ? "Editar Empresa" : "Nova Empresa"}
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Nome *</label>
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">CNPJ</label>
              <input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Descrição da Atividade</label>
            <textarea value={form.descricao_atividade} onChange={(e) => setForm({ ...form, descricao_atividade: e.target.value })} rows={2} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Segmentos (separados por vírgula)</label>
              <input value={form.segmentos} onChange={(e) => setForm({ ...form, segmentos: e.target.value })} placeholder="Ex: Equipamentos, Saúde" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Palavras-chave (separadas por vírgula)</label>
              <input value={form.palavras_chave} onChange={(e) => setForm({ ...form, palavras_chave: e.target.value })} placeholder="Ex: tomógrafo, ressonância" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Prompt Personalizado para IA</label>
            <textarea value={form.prompt_personalizado} onChange={(e) => setForm({ ...form, prompt_personalizado: e.target.value })} rows={3} placeholder="Descreva o escopo da empresa para análise de IA..." className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={saveMutation.isPending} className="flex h-10 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground shadow hover:opacity-90 transition disabled:opacity-50">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
              {editingId ? "Salvar alterações" : "Criar Empresa"}
            </button>
            <button type="button" onClick={resetForm} className="flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted transition">
              Cancelar
            </button>
          </div>
        </motion.form>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : !empresas?.length ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center py-20">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10"><Building2 className="h-8 w-8 text-primary" /></div>
          <h2 className="mt-4 font-display text-lg font-semibold text-foreground">Nenhuma empresa cadastrada</h2>
          <p className="mt-2 text-sm text-muted-foreground">Clique em "Nova Empresa" para começar.</p>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {empresas.map((emp, i) => (
            <motion.div
              key={emp.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="rounded-xl border border-border bg-card p-6 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEdit(emp)} className="text-muted-foreground hover:text-primary transition" title="Editar">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Remover ${emp.nome}?`)) deleteMutation.mutate(emp.id);
                      }}
                      className="text-muted-foreground hover:text-destructive transition"
                      title="Remover"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold text-foreground">{emp.nome}</h3>
              {emp.cnpj && <p className="text-xs text-muted-foreground font-mono">{emp.cnpj}</p>}
              {emp.descricao_atividade && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{emp.descricao_atividade}</p>}
              {emp.palavras_chave && emp.palavras_chave.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {emp.palavras_chave.slice(0, 5).map((kw: string) => (
                    <span key={kw} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{kw}</span>
                  ))}
                </div>
              )}
              {emp.segmentos && emp.segmentos.length > 0 && (
                <div className="mt-3 flex items-center gap-1 text-sm text-muted-foreground">
                  <Zap className="h-3.5 w-3.5" /> {emp.segmentos.join(", ")}
                </div>
              )}
              {/* Recorte materializado — clicável */}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link
                  to={`/empresas/${emp.id}?tab=vitorias`}
                  className="group flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 transition hover:border-primary hover:bg-primary/5"
                >
                  <Trophy className="h-4 w-4 text-amber-500" />
                  <div className="text-xs flex-1">
                    <div className="font-semibold text-foreground">{vinculosByEmpresa?.[emp.id]?.vitorias ?? 0}</div>
                    <div className="text-muted-foreground">vitórias</div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition" />
                </Link>
                <Link
                  to={`/empresas/${emp.id}?tab=contratos`}
                  className="group flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 transition hover:border-primary hover:bg-primary/5"
                >
                  <FileText className="h-4 w-4 text-primary" />
                  <div className="text-xs flex-1">
                    <div className="font-semibold text-foreground">{vinculosByEmpresa?.[emp.id]?.contratos ?? 0}</div>
                    <div className="text-muted-foreground">contratos</div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition" />
                </Link>
              </div>
              {isAdmin && (
                <button
                  onClick={() => refreshMutation.mutate(emp.id)}
                  disabled={refreshMutation.isPending}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition disabled:opacity-50"
                  title="Recalcular vínculos a partir do CNPJ"
                >
                  {refreshMutation.isPending && refreshMutation.variables === emp.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <RefreshCw className="h-3.5 w-3.5" />}
                  Reprocessar vínculos
                </button>
              )}
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
