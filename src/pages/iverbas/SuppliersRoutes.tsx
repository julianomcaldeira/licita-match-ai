import { useNavigate, useParams } from "react-router-dom";
import SuppliersPage from "@/pages/iverbas/SuppliersPage";
import SupplierDetailPage from "@/pages/iverbas/SupplierDetailPage";

export function SuppliersListRoute() {
  const navigate = useNavigate();
  return (
    <SuppliersPage
      onSelectSupplier={(cnpj) => navigate(`/execucao/fornecedores/${encodeURIComponent(cnpj)}`)}
    />
  );
}

export function SupplierDetailRoute() {
  const navigate = useNavigate();
  const { cnpj } = useParams<{ cnpj: string }>();
  if (!cnpj) return null;
  return (
    <SupplierDetailPage
      cnpj={decodeURIComponent(cnpj)}
      onBack={() => navigate("/execucao/fornecedores")}
    />
  );
}
