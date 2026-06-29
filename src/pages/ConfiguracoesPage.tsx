import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Users, Brain } from "lucide-react";
import AIMonitorPage from "./AIMonitorPage";
import UsuariosPage from "./UsuariosPage";
import { useAuth } from "@/contexts/AuthContext";
import { useSearchParams } from "react-router-dom";

export default function ConfiguracoesPage() {
  const { role } = useAuth();
  const isAdminCentral = role === "admin_central";
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "usuarios";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" /> Configurações
        </h1>
        <p className="text-sm text-muted-foreground">
          Gerencie usuários, perfis de acesso e monitoramento do consumo de IA.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })} className="space-y-4">
        <TabsList>
          <TabsTrigger value="usuarios" className="gap-2"><Users className="h-4 w-4" /> Usuários e Perfis</TabsTrigger>
          {isAdminCentral && (
            <TabsTrigger value="consumo-ia" className="gap-2"><Brain className="h-4 w-4" /> Consumo de IA</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="usuarios" className="mt-4">
          <UsuariosPage />
        </TabsContent>

        {isAdminCentral && (
          <TabsContent value="consumo-ia" className="mt-4">
            <AIMonitorPage embedded />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
