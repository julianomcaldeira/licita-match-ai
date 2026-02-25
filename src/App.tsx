import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import Dashboard from "@/pages/Dashboard";
import LicitacoesPage from "@/pages/LicitacoesPage";
import OportunidadesPage from "@/pages/OportunidadesPage";
import EmpresasPage from "@/pages/EmpresasPage";
import PlaceholderPage from "@/components/PlaceholderPage";
import NotFound from "@/pages/NotFound";
import { Users, Brain, FileText, BarChart3, Bell, Shield, Settings } from "lucide-react";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/licitacoes" element={<LicitacoesPage />} />
            <Route path="/oportunidades" element={<OportunidadesPage />} />
            <Route path="/empresas" element={<EmpresasPage />} />
            <Route path="/usuarios" element={<PlaceholderPage title="Usuários" description="Gerencie usuários e permissões por empresa" icon={Users} />} />
            <Route path="/motor-ia" element={<PlaceholderPage title="Motor IA" description="Configure embeddings, prompts e critérios de matching semântico" icon={Brain} />} />
            <Route path="/relatorios" element={<PlaceholderPage title="Relatórios" description="Exporte dados em CSV e PDF com filtros avançados" icon={FileText} />} />
            <Route path="/analytics" element={<PlaceholderPage title="Analytics" description="Métricas globais, consumo de tokens e atividade por empresa" icon={BarChart3} />} />
            <Route path="/notificacoes" element={<PlaceholderPage title="Notificações" description="Alertas por e-mail para oportunidades com score acima de 80%" icon={Bell} />} />
            <Route path="/auditoria" element={<PlaceholderPage title="Auditoria" description="Logs de acesso, segurança e controle de permissões" icon={Shield} />} />
            <Route path="/configuracoes" element={<PlaceholderPage title="Configurações" description="Parâmetros gerais do sistema e integrações" icon={Settings} />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
