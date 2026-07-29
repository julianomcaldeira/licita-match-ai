import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Users, Brain } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
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
      <PageHeader
        title="Configurações"
        description="Gerencie usuários, perfis de acesso e monitoramento do consumo de IA."
        icon={<Settings className="h-5 w-5" />}
      />


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
