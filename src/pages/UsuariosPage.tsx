import { useState } from "react";
import { motion } from "framer-motion";
import { Users, Plus, Loader2, X, Shield, ShieldCheck, User, Building2, Mail, Trash2, Pencil, Check } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

const ROLE_LABELS: Record<string, string> = {
  admin_central: "Admin Central",
  admin_empresa: "Admin Empresa",
  usuario_empresa: "Usuário",
};

const ROLE_COLORS: Record<string, string> = {
  admin_central: "bg-chart-1/10 text-chart-1 border-chart-1/20",
  admin_empresa: "bg-chart-2/10 text-chart-2 border-chart-2/20",
  usuario_empresa: "bg-chart-3/10 text-chart-3 border-chart-3/20",
};

const ROLE_ICONS: Record<string, typeof Shield> = {
  admin_central: ShieldCheck,
  admin_empresa: Shield,
  usuario_empresa: User,
};

interface UserRow {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  role: string | null;
  role_id: string | null;
  empresa_id: string | null;
  empresa_nome: string | null;
}

interface InviteForm {
  email: string;
  display_name: string;
  role: string;
  empresa_id: string;
}

const emptyInvite: InviteForm = { email: "", display_name: "", role: "usuario_empresa", empresa_id: "" };

export default function UsuariosPage() {
  const { role: myRole, user } = useAuth();
  const isAdmin = myRole === "admin_central";
  const queryClient = useQueryClient();

  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteForm>(emptyInvite);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editEmpresa, setEditEmpresa] = useState("");

  // Fetch users with roles
  const { data: users, isLoading } = useQuery({
    queryKey: ["usuarios-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, email, display_name, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;

      // Fetch roles separately to avoid join issues
      const userIds = data.map((p) => p.user_id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("id, user_id, role, empresa_id")
        .in("user_id", userIds);

      // Fetch empresa names
      const empresaIds = (roles || []).map((r) => r.empresa_id).filter(Boolean) as string[];
      let empresasMap: Record<string, string> = {};
      if (empresaIds.length > 0) {
        const { data: empresas } = await supabase
          .from("empresas_clientes")
          .select("id, nome")
          .in("id", empresaIds);
        empresasMap = (empresas || []).reduce((acc, e) => ({ ...acc, [e.id]: e.nome }), {} as Record<string, string>);
      }

      return data.map((p): UserRow => {
        const userRole = (roles || []).find((r) => r.user_id === p.user_id);
        return {
          ...p,
          role: userRole?.role || null,
          role_id: userRole?.id || null,
          empresa_id: userRole?.empresa_id || null,
          empresa_nome: userRole?.empresa_id ? empresasMap[userRole.empresa_id] || null : null,
        };
      });
    },
    enabled: isAdmin,
  });

  // Fetch empresas for selects
  const { data: empresas } = useQuery({
    queryKey: ["empresas-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas_clientes").select("id, nome").order("nome");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  // Invite user mutation
  const inviteMutation = useMutation({
    mutationFn: async (form: InviteForm) => {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email: form.email,
          display_name: form.display_name || undefined,
          role: form.role,
          empresa_id: form.empresa_id || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Usuário convidado com sucesso!");
      setShowInvite(false);
      setInviteForm(emptyInvite);
      queryClient.invalidateQueries({ queryKey: ["usuarios-list"] });
    },
    onError: (e: any) => toast.error(e.message || "Erro ao convidar usuário"),
  });

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ roleId, role, empresa_id }: { roleId: string; role: string; empresa_id: string | null }) => {
      const { error } = await supabase
        .from("user_roles")
        .update({ role: role as any, empresa_id })
        .eq("id", roleId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Permissão atualizada!");
      setEditingUser(null);
      queryClient.invalidateQueries({ queryKey: ["usuarios-list"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Delete role mutation
  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("id", roleId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Acesso do usuário removido");
      queryClient.invalidateQueries({ queryKey: ["usuarios-list"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (u: UserRow) => {
    setEditingUser(u);
    setEditRole(u.role || "usuario_empresa");
    setEditEmpresa(u.empresa_id || "");
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Shield className="h-12 w-12 text-muted-foreground/40" />
        <h2 className="mt-4 font-display text-lg font-semibold text-foreground">Acesso Restrito</h2>
        <p className="mt-2 text-sm text-muted-foreground">Apenas administradores centrais podem gerenciar usuários.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            {users?.length ? `${users.length} usuários cadastrados` : "Gerencie usuários e permissões"}
          </p>
        </div>
        <button
          onClick={() => setShowInvite(!showInvite)}
          className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:opacity-90 transition"
        >
          {showInvite ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showInvite ? "Cancelar" : "Convidar Usuário"}
        </button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <motion.form
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={(e) => { e.preventDefault(); inviteMutation.mutate(inviteForm); }}
          className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Email *</label>
              <input
                type="email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                required
                placeholder="usuario@empresa.com"
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Nome</label>
              <input
                value={inviteForm.display_name}
                onChange={(e) => setInviteForm({ ...inviteForm, display_name: e.target.value })}
                placeholder="Nome do usuário"
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Permissão *</label>
              <Select value={inviteForm.role} onValueChange={(v) => setInviteForm({ ...inviteForm, role: v })}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin_central">Admin Central</SelectItem>
                  <SelectItem value="admin_empresa">Admin Empresa</SelectItem>
                  <SelectItem value="usuario_empresa">Usuário</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Empresa</label>
              <Select value={inviteForm.empresa_id} onValueChange={(v) => setInviteForm({ ...inviteForm, empresa_id: v })}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Selecionar empresa..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem empresa</SelectItem>
                  {empresas?.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <button
            type="submit"
            disabled={inviteMutation.isPending}
            className="flex h-10 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground shadow hover:opacity-90 transition disabled:opacity-50"
          >
            {inviteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Convidar
          </button>
        </motion.form>
      )}

      {/* Users table */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !users?.length ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center py-20">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Users className="h-8 w-8 text-primary" />
          </div>
          <h2 className="mt-4 font-display text-lg font-semibold text-foreground">Nenhum usuário encontrado</h2>
          <p className="mt-2 text-sm text-muted-foreground">Convide usuários para começar.</p>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {users.map((u, i) => {
              const RoleIcon = ROLE_ICONS[u.role || ""] || User;
              const isCurrentUser = u.user_id === user?.id;
              return (
                <motion.div
                  key={u.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="rounded-xl border border-border bg-card shadow-sm p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {u.display_name || "—"}
                          {isCurrentUser && <span className="ml-2 text-xs text-muted-foreground">(você)</span>}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{u.email || "—"}</p>
                      </div>
                    </div>
                    {!isCurrentUser && u.role_id && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openEdit(u)} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition" title="Editar">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => { if (confirm(`Remover acesso de ${u.display_name || u.email}?`)) deleteRoleMutation.mutate(u.role_id!); }}
                          className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"
                          title="Remover"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    {u.role ? (
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${ROLE_COLORS[u.role] || "bg-muted text-muted-foreground border-border"}`}>
                        <RoleIcon className="h-3 w-3" />
                        {ROLE_LABELS[u.role] || u.role}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem permissão</span>
                    )}
                    {u.empresa_nome && (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5" />
                        {u.empresa_nome}
                      </span>
                    )}
                    <span className="ml-auto text-muted-foreground">{new Date(u.created_at).toLocaleDateString("pt-BR")}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="table-scroll">
              <table className="table-sticky">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Usuário</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Permissão</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Empresa</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Cadastro</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => {
                    const RoleIcon = ROLE_ICONS[u.role || ""] || User;
                    const isCurrentUser = u.user_id === user?.id;
                    return (
                      <motion.tr
                        key={u.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="border-b border-border/50 hover:bg-muted/30 transition"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                              <User className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium text-foreground">
                                {u.display_name || "—"}
                                {isCurrentUser && (
                                  <span className="ml-2 text-xs text-muted-foreground">(você)</span>
                                )}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{u.email || "—"}</td>
                        <td className="px-4 py-3">
                          {u.role ? (
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${ROLE_COLORS[u.role] || "bg-muted text-muted-foreground border-border"}`}>
                              <RoleIcon className="h-3 w-3" />
                              {ROLE_LABELS[u.role] || u.role}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Sem permissão</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {u.empresa_nome ? (
                            <span className="inline-flex items-center gap-1 text-sm">
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                              {u.empresa_nome}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {new Date(u.created_at).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {!isCurrentUser && u.role_id && (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openEdit(u)}
                                className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition"
                                title="Editar permissão"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm(`Remover acesso de ${u.display_name || u.email}?`)) {
                                    deleteRoleMutation.mutate(u.role_id!);
                                  }
                                }}
                                className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"
                                title="Remover acesso"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}

      {/* Edit role dialog */}
      <Dialog open={!!editingUser} onOpenChange={(o) => !o && setEditingUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Permissão</DialogTitle>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{editingUser.display_name || "—"}</p>
                  <p className="text-xs text-muted-foreground">{editingUser.email}</p>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Permissão</label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin_central">Admin Central</SelectItem>
                    <SelectItem value="admin_empresa">Admin Empresa</SelectItem>
                    <SelectItem value="usuario_empresa">Usuário</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Empresa</label>
                <Select value={editEmpresa || "none"} onValueChange={(v) => setEditEmpresa(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Selecionar empresa..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem empresa</SelectItem>
                    {empresas?.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setEditingUser(null)}
                  className="h-9 rounded-lg border border-input px-4 text-sm font-medium text-muted-foreground hover:bg-secondary transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    if (editingUser.role_id) {
                      updateRoleMutation.mutate({
                        roleId: editingUser.role_id,
                        role: editRole,
                        empresa_id: editEmpresa || null,
                      });
                    }
                  }}
                  disabled={updateRoleMutation.isPending}
                  className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:opacity-90 transition disabled:opacity-50"
                >
                  {updateRoleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Salvar
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}