import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Building2, LayoutDashboard, Trophy } from "lucide-react";
import DashboardOverview from "@/components/dashboard/DashboardOverview";
import DashboardAnalytics from "@/components/dashboard/DashboardAnalytics";
import OrgaosList from "@/components/dashboard/OrgaosList";
import EmpresasVencedorasList from "@/components/dashboard/EmpresasVencedorasList";

export default function Dashboard() {
  return (
    <Tabs defaultValue="overview" className="space-y-6">
      <TabsList>
        <TabsTrigger value="overview" className="gap-2">
          <LayoutDashboard className="h-4 w-4" /> Visão Geral
        </TabsTrigger>
        <TabsTrigger value="analytics" className="gap-2">
          <BarChart3 className="h-4 w-4" /> Analytics
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
      <TabsContent value="analytics">
        <DashboardAnalytics />
      </TabsContent>
      <TabsContent value="orgaos">
        <OrgaosList />
      </TabsContent>
      <TabsContent value="empresas">
        <EmpresasVencedorasList />
      </TabsContent>
    </Tabs>
  );
}
