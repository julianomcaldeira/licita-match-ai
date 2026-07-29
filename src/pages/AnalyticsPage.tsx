import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Brain } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import DashboardAnalytics from "@/components/dashboard/DashboardAnalytics";
import AIMarketAnalysis from "@/components/dashboard/AIMarketAnalysis";

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Pergunte à IA sobre o mercado ou explore os gráficos consolidados — dados de fontes oficiais (PNCP, Portal da Transparência, SICONFI)."
        icon={<BarChart3 className="h-5 w-5" />}
      />

      <Tabs defaultValue="ai" className="space-y-4">

        <TabsList>
          <TabsTrigger value="ai" className="gap-1.5">
            <Brain className="h-3.5 w-3.5" /> Pergunte à IA
          </TabsTrigger>
          <TabsTrigger value="charts" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" /> Gráficos de mercado
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai">
          <AIMarketAnalysis />
        </TabsContent>

        <TabsContent value="charts">
          <DashboardAnalytics />
        </TabsContent>
      </Tabs>
    </div>
  );
}
