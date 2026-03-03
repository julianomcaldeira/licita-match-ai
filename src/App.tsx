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
import PlaceholderPage from "@/components/PlaceholderPage";
import NotFound from "@/pages/NotFound";
import { Users, FileText, BarChart3, Settings } from "lucide-react";

const queryClient = new QueryClient();

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
              <Route path="/usuarios" element={<PlaceholderPage title="Usuários" description="Gerencie usuários e permissões por empresa" icon={Users} />} />
              <Route path="/relatorios" element={<PlaceholderPage title="Relatórios" description="Exporte dados em CSV e PDF com filtros avançados" icon={FileText} />} />
              <Route path="/analytics" element={<PlaceholderPage title="Analytics" description="Métricas globais, consumo de tokens e atividade por empresa" icon={BarChart3} />} />
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
