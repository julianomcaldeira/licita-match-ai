import { motion } from "framer-motion";
import { Building2, MoreHorizontal, Users, Zap } from "lucide-react";

const mockEmpresas = [
  { id: 1, nome: "MedTech Equipamentos", cnpj: "12.345.678/0001-90", segmento: "Equipamentos Hospitalares", usuarios: 8, oportunidades: 47, scoreMedio: 78 },
  { id: 2, nome: "DataSec Tecnologia", cnpj: "98.765.432/0001-10", segmento: "Segurança da Informação", usuarios: 5, oportunidades: 32, scoreMedio: 65 },
  { id: 3, nome: "Construtora Horizonte", cnpj: "11.222.333/0001-44", segmento: "Engenharia Civil", usuarios: 12, oportunidades: 89, scoreMedio: 71 },
];

export default function EmpresasPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Empresas</h1>
          <p className="text-sm text-muted-foreground">Gestão de clientes da plataforma</p>
        </div>
        <button className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:opacity-90 transition">
          <Building2 className="h-4 w-4" /> Nova Empresa
        </button>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {mockEmpresas.map((emp, i) => (
          <motion.div
            key={emp.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="rounded-xl border border-border bg-card p-6 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <button className="text-muted-foreground hover:text-foreground">
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold text-foreground">{emp.nome}</h3>
            <p className="text-xs text-muted-foreground font-mono">{emp.cnpj}</p>
            <p className="mt-1 text-sm text-muted-foreground">{emp.segmento}</p>
            <div className="mt-4 flex items-center gap-4 border-t border-border pt-4 text-sm">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Users className="h-4 w-4" /> {emp.usuarios}
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Zap className="h-4 w-4" /> {emp.oportunidades} oport.
              </div>
              <div className="ml-auto font-display font-bold text-primary">{emp.scoreMedio}%</div>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
