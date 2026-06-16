import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Key, Plus, Copy, Trash2, ToggleLeft, ToggleRight, BookOpen, AlertTriangle, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-api`;
const GLOBAL_SCOPE = "__global__";

const DOCS_ENDPOINTS = [
  { method: "GET", path: "/me", desc: "Dados do cliente vinculado à chave (nome, CNPJs, segmentos, palavras-chave)", params: "—" },
  { method: "GET", path: "/me/resumo", desc: "KPIs consolidados do recorte do cliente", params: "—" },
  { method: "GET", path: "/me/vitorias", desc: "Licitações vencidas e contratos firmados (somente por CNPJ)", params: "limit, offset" },
  { method: "GET", path: "/licitacoes", desc: "Licitações — recorte do cliente se a chave for vinculada", params: "search, uf, modalidade, date_from, date_to, only_vencidas, com_vencedor, limit, offset" },
  { method: "GET", path: "/licitacoes/:id", desc: "Detalhe de licitação (404 se fora do recorte do cliente)", params: "UUID" },
  { method: "GET", path: "/contratos", desc: "Contratos — recorte do cliente se a chave for vinculada", params: "search, uf, fornecedor_cnpj, date_from, date_to, only_proprios, limit, offset" },
  { method: "GET", path: "/orgaos", desc: "Lista órgãos públicos (global)", params: "search, uf, order_by, limit, offset" },
  { method: "GET", path: "/empresas-vencedoras", desc: "Empresas vencedoras (global)", params: "search, uf, order_by, limit, offset" },
  { method: "GET", path: "/sancionadas", desc: "Empresas sancionadas CEIS/CNEP (global)", params: "search, uf, tipo_cadastro, vigente, limit, offset" },
  { method: "GET", path: "/check-sancionada/:cnpj", desc: "Verificação rápida de CNPJ sancionado", params: "CNPJ (apenas números)" },
];

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateApiKey(): string {
  // 64 hex chars (~256 bits)
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function ApiKeysPage() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [newClientName, setNewClientName] = useState("");
  const [newEmpresaId, setNewEmpresaId] = useState<string>(GLOBAL_SCOPE);
  const [revealedKey, setRevealedKey] = useState<{ client_name: string; api_key: string } | null>(null);
  const isAdmin = role === "admin_central";

  const { data: keys, isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_keys")
        .select("*, empresas_clientes:empresa_cliente_id(id, nome)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const { data: empresas } = useQuery({
    queryKey: ["empresas-clientes-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empresas_clientes")
        .select("id, nome")
        .order("nome");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const createKey = useMutation({
    mutationFn: async ({ clientName, empresaId }: { clientName: string; empresaId: string | null }) => {
      const apiKey = generateApiKey();
      const api_key_hash = await sha256Hex(apiKey);
      const api_key_prefix = apiKey.slice(0, 8);
      const { data, error } = await supabase
        .from("api_keys")
        .insert({ client_name: clientName, api_key_hash, api_key_prefix, empresa_cliente_id: empresaId })
        .select()
        .single();
      if (error) throw error;
      return { ...data, api_key: apiKey };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setNewClientName("");
      setNewEmpresaId(GLOBAL_SCOPE);
      setRevealedKey({ client_name: data.client_name, api_key: data.api_key });
      toast({ title: "API Key criada", description: `Copie a chave agora — ela não será exibida novamente.` });
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
          {/* Reveal banner (one-time) */}
          {revealedKey && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-amber-900 dark:text-amber-200">
                    Copie a chave de {revealedKey.client_name} agora
                  </h3>
                  <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                    Por segurança, armazenamos apenas o hash. Esta é a única vez que você verá a chave completa.
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <code className="text-xs bg-white dark:bg-background px-3 py-2 rounded font-mono flex-1 break-all border">
                      {revealedKey.api_key}
                    </code>
                    <Button size="sm" onClick={() => copyToClipboard(revealedKey.api_key)}>
                      <Copy className="h-4 w-4 mr-1" /> Copiar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRevealedKey(null)}>
                      Pronto
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Create new key */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
            <h2 className="font-display text-sm font-semibold text-foreground">Nova Chave de API</h2>
            <div className="grid gap-3 md:grid-cols-[1fr_260px_auto]">
              <Input
                placeholder="Nome do cliente / sistema..."
                value={newClientName}
                onChange={e => setNewClientName(e.target.value)}
                maxLength={100}
              />
              <Select value={newEmpresaId} onValueChange={setNewEmpresaId}>
                <SelectTrigger><SelectValue placeholder="Escopo da chave..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={GLOBAL_SCOPE}>Global (admin)</SelectItem>
                  {empresas?.map(e => (
                    <SelectItem key={e.id} value={e.id}>Cliente: {e.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => createKey.mutate({
                  clientName: newClientName.trim(),
                  empresaId: newEmpresaId === GLOBAL_SCOPE ? null : newEmpresaId,
                })}
                disabled={!newClientName.trim() || createKey.isPending}
              >
                <Plus className="h-4 w-4 mr-1" /> Criar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Chaves vinculadas a um cliente entregam apenas o recorte daquele cliente em <code>/licitacoes</code>, <code>/contratos</code> e <code>/me/*</code>.
              Chaves globais mantêm o comportamento atual e veem todos os dados.
            </p>
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
                    <TableHead>Cliente / Sistema</TableHead>
                    <TableHead>Escopo</TableHead>
                    <TableHead>Identificador</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Último uso</TableHead>
                    <TableHead>Criada em</TableHead>
                    <TableHead className="w-[120px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                  ) : !keys?.length ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma chave criada</TableCell></TableRow>
                  ) : keys.map((k: any) => (
                    <TableRow key={k.id}>
                      <TableCell className="font-medium">{k.client_name}</TableCell>
                      <TableCell>
                        {k.empresas_clientes ? (
                          <Badge variant="outline" className="text-[10px] gap-1">
                            <Building2 className="h-3 w-3" />
                            {k.empresas_clientes.nome}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">Global</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                          {k.api_key_prefix}…
                        </code>
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
            <p className="text-xs text-muted-foreground mt-3">
              As chaves completas não são armazenadas em texto puro. Para rotacionar, crie uma nova chave e remova a antiga.
            </p>
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
