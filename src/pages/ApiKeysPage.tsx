import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Key, Plus, Copy, Trash2, ToggleLeft, ToggleRight, BookOpen, CheckCircle2, Clock, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-api`;

const DOCS_ENDPOINTS = [
  { method: "GET", path: "/licitacoes", desc: "Busca licitações com filtros", params: "search, uf, modalidade, date_from, date_to, com_vencedor, limit, offset" },
  { method: "GET", path: "/licitacoes/:id", desc: "Detalhes da licitação com itens e vencedores", params: "UUID da licitação" },
  { method: "GET", path: "/orgaos", desc: "Lista órgãos públicos", params: "search, uf, order_by (total_licitacoes|total_valor), limit, offset" },
  { method: "GET", path: "/empresas-vencedoras", desc: "Lista empresas vencedoras", params: "search, uf, order_by (total_vitorias|total_valor), limit, offset" },
  { method: "GET", path: "/sancionadas", desc: "Empresas sancionadas (CEIS/CNEP)", params: "search, uf, tipo_cadastro (CEIS|CNEP), vigente (true|false), limit, offset" },
  { method: "GET", path: "/check-sancionada/:cnpj", desc: "Verificação rápida de CNPJ sancionado", params: "CNPJ (apenas números)" },
  { method: "GET", path: "/contratos", desc: "Consulta contratos públicos", params: "search, fornecedor_cnpj, limit, offset" },
];

export default function ApiKeysPage() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [newClientName, setNewClientName] = useState("");
  const isAdmin = role === "admin_central";

  const { data: keys, isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const { data, error } = await supabase.from("api_keys").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const createKey = useMutation({
    mutationFn: async (clientName: string) => {
      const { data, error } = await supabase.from("api_keys").insert({ client_name: clientName }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setNewClientName("");
      toast({ title: "API Key criada", description: `Chave gerada para ${data.client_name}` });
    },
    onError: () => toast({ title: "Erro ao criar chave", variant: "destructive" }),
  });

  const toggleKey = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("api_keys").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  const deleteKey = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("api_keys").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast({ title: "Chave removida" });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado!", description: "Chave copiada para a área de transferência" });
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Acesso restrito ao administrador central.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Key className="h-6 w-6 text-primary" /> API Pública
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie chaves de acesso e consulte a documentação da API
        </p>
      </div>

      <Tabs defaultValue="keys">
        <TabsList>
          <TabsTrigger value="keys" className="gap-2"><Key className="h-4 w-4" /> Chaves de Acesso</TabsTrigger>
          <TabsTrigger value="docs" className="gap-2"><BookOpen className="h-4 w-4" /> Documentação</TabsTrigger>
        </TabsList>

        <TabsContent value="keys" className="space-y-4 mt-4">
          {/* Create new key */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-display text-sm font-semibold text-foreground mb-3">Nova Chave de API</h2>
            <div className="flex gap-2 max-w-lg">
              <Input
                placeholder="Nome do cliente / sistema..."
                value={newClientName}
                onChange={e => setNewClientName(e.target.value)}
                maxLength={100}
                onKeyDown={e => e.key === "Enter" && newClientName.trim() && createKey.mutate(newClientName.trim())}
              />
              <Button onClick={() => createKey.mutate(newClientName.trim())} disabled={!newClientName.trim() || createKey.isPending}>
                <Plus className="h-4 w-4 mr-1" /> Criar
              </Button>
            </div>
          </div>

          {/* Keys table */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-display text-sm font-semibold text-foreground mb-3">
              Chaves Ativas ({keys?.filter(k => k.is_active).length ?? 0})
            </h2>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>API Key</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Último uso</TableHead>
                    <TableHead>Criada em</TableHead>
                    <TableHead className="w-[120px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                  ) : !keys?.length ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma chave criada</TableCell></TableRow>
                  ) : keys.map(k => (
                    <TableRow key={k.id}>
                      <TableCell className="font-medium">{k.client_name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                            {k.api_key.slice(0, 8)}...{k.api_key.slice(-4)}
                          </code>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(k.api_key)}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={k.is_active ? "default" : "secondary"} className="text-[10px]">
                          {k.is_active ? "Ativa" : "Inativa"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {k.last_used_at
                          ? new Date(k.last_used_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                          : "Nunca"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(k.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => toggleKey.mutate({ id: k.id, is_active: !k.is_active })}
                            title={k.is_active ? "Desativar" : "Ativar"}
                          >
                            {k.is_active ? <ToggleRight className="h-4 w-4 text-success" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                            onClick={() => { if (confirm("Remover esta chave permanentemente?")) deleteKey.mutate(k.id); }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="docs" className="space-y-4 mt-4">
          {/* Base URL */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-display text-sm font-semibold text-foreground mb-2">Base URL</h2>
            <div className="flex items-center gap-2">
              <code className="text-sm bg-muted px-3 py-2 rounded font-mono flex-1 break-all">{API_BASE}</code>
              <Button variant="ghost" size="icon" onClick={() => copyToClipboard(API_BASE)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Auth */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-display text-sm font-semibold text-foreground mb-2">Autenticação</h2>
            <p className="text-sm text-muted-foreground mb-3">Envie a API key em qualquer uma das formas:</p>
            <div className="space-y-2 font-mono text-xs bg-muted p-3 rounded">
              <p className="text-foreground">
                <span className="text-primary">Header:</span> x-api-key: sua_chave_aqui
              </p>
              <p className="text-foreground">
                <span className="text-primary">Header:</span> Authorization: Bearer sua_chave_aqui
              </p>
            </div>
          </div>

          {/* Endpoints */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-display text-sm font-semibold text-foreground mb-3">Endpoints Disponíveis</h2>
            <div className="space-y-3">
              {DOCS_ENDPOINTS.map(ep => (
                <div key={ep.path} className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-[10px] font-mono text-primary">{ep.method}</Badge>
                    <code className="text-sm font-mono font-medium text-foreground">{ep.path}</code>
                  </div>
                  <p className="text-sm text-muted-foreground">{ep.desc}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    <span className="text-foreground font-medium">Parâmetros:</span> {ep.params}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Example */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-display text-sm font-semibold text-foreground mb-2">Exemplo de Uso (cURL)</h2>
            <pre className="text-xs bg-muted p-3 rounded font-mono overflow-x-auto whitespace-pre-wrap text-foreground">
{`curl -H "x-api-key: SUA_CHAVE" \\
  "${API_BASE}/licitacoes?uf=SP&search=tecnologia&limit=10"

# Verificar CNPJ sancionado
curl -H "x-api-key: SUA_CHAVE" \\
  "${API_BASE}/check-sancionada/12345678000199"

# Detalhe de uma licitação
curl -H "x-api-key: SUA_CHAVE" \\
  "${API_BASE}/licitacoes/UUID_DA_LICITACAO"`}
            </pre>
          </div>

          {/* Response format */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-display text-sm font-semibold text-foreground mb-2">Formato de Resposta</h2>
            <pre className="text-xs bg-muted p-3 rounded font-mono overflow-x-auto text-foreground">
{`{
  "data": [...],
  "meta": {
    "limit": 50,
    "offset": 0,
    "total": 1234
  }
}`}
            </pre>
            <p className="text-xs text-muted-foreground mt-2">Máximo de 500 registros por requisição. Use offset para paginação.</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
