import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Brain } from "lucide-react";
import DashboardAnalytics from "@/components/dashboard/DashboardAnalytics";
import AIMarketAnalysis from "@/components/dashboard/AIMarketAnalysis";

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">i-pesquisei Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Pergunte à IA sobre o mercado ou explore os gráficos consolidados — todos os dados vêm de fontes oficiais (PNCP, Portal da Transparência, SICONFI).
        </p>
      </div>

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
