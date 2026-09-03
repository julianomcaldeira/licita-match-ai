import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, role, empresaId } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const precisaCompletarCadastro =
    role && role !== "admin_central" && !empresaId && location.pathname !== "/completar-cadastro";
  if (precisaCompletarCadastro) {
    return <Navigate to="/completar-cadastro" replace />;
  }

  return <>{children}</>;
}
