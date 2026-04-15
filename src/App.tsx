import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/layout/AppLayout";
import AuthPage from "@/pages/AuthPage";
import Dashboard from "@/pages/Dashboard";
import LicitacoesPage from "@/pages/LicitacoesPage";
import EmpresasPage from "@/pages/EmpresasPage";
import IngestaoMonitorPage from "@/pages/IngestaoMonitorPage";
import AnalyticsPage from "@/pages/AnalyticsPage";
import PlaceholderPage from "@/components/PlaceholderPage";
import UsuariosPage from "@/pages/UsuariosPage";
import RelatoriosPage from "@/pages/RelatoriosPage";
import SancionadasPage from "@/pages/SancionadasPage";
import ApiKeysPage from "@/pages/ApiKeysPage";
import NotFound from "@/pages/NotFound";
import { Users, FileText, Settings } from "lucide-react";

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
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/licitacoes" element={<LicitacoesPage />} />
              <Route path="/empresas" element={<EmpresasPage />} />
              <Route path="/usuarios" element={<UsuariosPage />} />
              <Route path="/relatorios" element={<RelatoriosPage />} />
              <Route path="/sancionadas" element={<SancionadasPage />} />
              <Route path="/api" element={<ApiKeysPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/monitor-ingestao" element={<IngestaoMonitorPage />} />
              <Route path="/configuracoes" element={<PlaceholderPage title="Configurações" description="Parâmetros gerais do sistema e integrações" icon={Settings} />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
