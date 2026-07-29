import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, FileText, LayoutDashboard, Trophy } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import DashboardOverview from "@/components/dashboard/DashboardOverview";
import TopLicitacoesList from "@/components/dashboard/TopLicitacoesList";
import OrgaosList from "@/components/dashboard/OrgaosList";
import EmpresasVencedorasList from "@/components/dashboard/EmpresasVencedorasList";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Panorama do dinheiro público: valores movimentados, órgãos, licitações e empresas vencedoras."
        icon={<LayoutDashboard className="h-5 w-5" />}
      />
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview" className="gap-2">
            <LayoutDashboard className="h-4 w-4" /> Visão Geral
          </TabsTrigger>
          <TabsTrigger value="licitacoes" className="gap-2">
            <FileText className="h-4 w-4" /> Licitações
          </TabsTrigger>
          <TabsTrigger value="orgaos" className="gap-2">
            <Building2 className="h-4 w-4" /> Órgãos
          </TabsTrigger>
          <TabsTrigger value="empresas" className="gap-2">
            <Trophy className="h-4 w-4" /> Empresas
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <DashboardOverview />
        </TabsContent>
        <TabsContent value="licitacoes">
          <TopLicitacoesList />
        </TabsContent>
        <TabsContent value="orgaos">
          <OrgaosList />
        </TabsContent>
        <TabsContent value="empresas">
          <EmpresasVencedorasList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
