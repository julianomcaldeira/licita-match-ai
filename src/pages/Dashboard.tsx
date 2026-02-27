import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, LayoutDashboard } from "lucide-react";
import DashboardOverview from "@/components/dashboard/DashboardOverview";
import DashboardAnalytics from "@/components/dashboard/DashboardAnalytics";

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
      </TabsList>
      <TabsContent value="overview">
        <DashboardOverview />
      </TabsContent>
      <TabsContent value="analytics">
        <DashboardAnalytics />
      </TabsContent>
    </Tabs>
  );
}
