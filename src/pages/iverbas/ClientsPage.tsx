import React from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/i18n/LanguageContext";
import { Building2, Plus } from "lucide-react";

const mockClients = [
  { cnpj: "12.345.678/0001-90", razaoSocial: "TechGov Soluções S.A.", cnae: "6201-5/01", segmento: "Tecnologia", status: "Ativo" },
  { cnpj: "98.765.432/0001-10", razaoSocial: "Construtora Nacional Ltda.", cnae: "4120-4/00", segmento: "Construção Civil", status: "Ativo" },
  { cnpj: "11.222.333/0001-44", razaoSocial: "Saúde Brasil Serviços", cnae: "8610-1/01", segmento: "Saúde", status: "Ativo" },
];

const ClientsPage: React.FC = () => {
  const { t } = useLanguage();

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold text-foreground">{t("clients")}</h1>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg gradient-brand text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
          <Plus className="w-4 h-4" />
          Novo Cliente (CNPJ)
        </button>
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="text-left py-3 px-4 text-muted-foreground font-medium">CNPJ</th>
              <th className="text-left py-3 px-4 text-muted-foreground font-medium">Razão Social</th>
              <th className="text-left py-3 px-4 text-muted-foreground font-medium">CNAE</th>
              <th className="text-left py-3 px-4 text-muted-foreground font-medium">{t("segment")}</th>
              <th className="text-left py-3 px-4 text-muted-foreground font-medium">{t("status")}</th>
            </tr>
          </thead>
          <tbody>
            {mockClients.map((c) => (
              <tr key={c.cnpj} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{c.cnpj}</td>
                <td className="py-3 px-4 font-medium text-foreground">{c.razaoSocial}</td>
                <td className="py-3 px-4 text-muted-foreground font-mono text-xs">{c.cnae}</td>
                <td className="py-3 px-4 text-foreground">{c.segmento}</td>
                <td className="py-3 px-4">
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-accent text-primary">{c.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>
    </div>
  );
};

export default ClientsPage;
