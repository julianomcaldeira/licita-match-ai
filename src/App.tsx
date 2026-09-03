import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/i18n/LanguageContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/layout/AppLayout";
import AuthPage from "@/pages/AuthPage";
import CompletarCadastroPage from "@/pages/CompletarCadastroPage";
import Dashboard from "@/pages/Dashboard";
import LicitacoesPage from "@/pages/LicitacoesPage";
import EmpresasPage from "@/pages/EmpresasPage";
import ClienteDetalhePage from "@/pages/ClienteDetalhePage";
import IngestaoMonitorPage from "@/pages/IngestaoMonitorPage";
import AnalyticsPage from "@/pages/AnalyticsPage";
import PlaceholderPage from "@/components/PlaceholderPage";
import UsuariosPage from "@/pages/UsuariosPage";
import RelatoriosPage from "@/pages/RelatoriosPage";
import SancionadasPage from "@/pages/SancionadasPage";
import ClientesAdminPage from "@/pages/ClientesAdminPage";

import ApiKeysPage from "@/pages/ApiKeysPage";
import IndiceStartGiPage from "@/pages/IndiceStartGiPage";
import AIMonitorPage from "@/pages/AIMonitorPage";
import ConfiguracoesPage from "@/pages/ConfiguracoesPage";
import DiagnosticoDadosPage from "@/pages/DiagnosticoDadosPage";
import LandingPage from "@/pages/LandingPage";
import NotFound from "@/pages/NotFound";

import ExecucaoDashboardPage from "@/pages/iverbas/DashboardPage";
import BudgetBalancePage from "@/pages/iverbas/BudgetBalancePage";
import BudgetGrowthPage from "@/pages/iverbas/BudgetGrowthPage";
import OrgaosExecucaoPage from "@/pages/iverbas/CompaniesPage";
import { SuppliersListRoute, SupplierDetailRoute } from "@/pages/iverbas/SuppliersRoutes";
import PotencialCompraPage from "@/pages/iverbas/PotencialCompraPage";
import PaymentSpeedPage from "@/pages/iverbas/PaymentSpeedPage";
import ConcentrationPage from "@/pages/iverbas/ConcentrationPage";
import SeasonalityPage from "@/pages/iverbas/SeasonalityPage";
import IntelligencePage from "@/pages/iverbas/IntelligencePage";
import { AccessLogsPage, ApiLogsPage } from "@/pages/iverbas/LogsPages";
import EmendasPage from "@/pages/iverbas/EmendasPage";
import ContractsPage from "@/pages/iverbas/ContractsPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <LanguageProvider>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/landing" element={<LandingPage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/completar-cadastro" element={<ProtectedRoute><CompletarCadastroPage /></ProtectedRoute>} />
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/licitacoes" element={<LicitacoesPage />} />
                <Route path="/empresas" element={<EmpresasPage />} />
                <Route path="/empresas/:id" element={<ClienteDetalhePage />} />
                <Route path="/usuarios" element={<UsuariosPage />} />
                <Route path="/relatorios" element={<RelatoriosPage />} />
                <Route path="/sancionadas" element={<SancionadasPage />} />
                <Route path="/clientes" element={<ClientesAdminPage />} />

                <Route path="/indice-startgi" element={<IndiceStartGiPage />} />
                <Route path="/api" element={<ApiKeysPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/monitor-ingestao" element={<IngestaoMonitorPage />} />
                <Route path="/consumo-ia" element={<AIMonitorPage />} />
                <Route path="/configuracoes" element={<ConfiguracoesPage />} />
                <Route path="/diagnostico-dados" element={<DiagnosticoDadosPage />} />

                <Route path="/execucao" element={<ExecucaoDashboardPage />} />
                <Route path="/execucao/orcamento" element={<BudgetBalancePage />} />
                <Route path="/execucao/orcamento/evolucao" element={<BudgetGrowthPage />} />
                <Route path="/execucao/orgaos" element={<OrgaosExecucaoPage />} />
                <Route path="/execucao/fornecedores" element={<SuppliersListRoute />} />
                <Route path="/execucao/fornecedores/:cnpj" element={<SupplierDetailRoute />} />
                <Route path="/execucao/potencial-compra" element={<PotencialCompraPage />} />
                <Route path="/execucao/velocidade-pagamento" element={<PaymentSpeedPage />} />
                <Route path="/execucao/concentracao" element={<ConcentrationPage />} />
                <Route path="/execucao/sazonalidade" element={<SeasonalityPage />} />
                <Route path="/execucao/inteligencia" element={<IntelligencePage />} />
                <Route path="/execucao/logs/acessos" element={<AccessLogsPage />} />
                <Route path="/execucao/logs/api" element={<ApiLogsPage />} />
                <Route path="/execucao/emendas" element={<EmendasPage />} />
                <Route path="/execucao/contratos" element={<ContractsPage />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </LanguageProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
