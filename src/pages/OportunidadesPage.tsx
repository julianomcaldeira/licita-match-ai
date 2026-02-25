import { motion } from "framer-motion";
import { Zap, TrendingUp, ArrowRight, Star } from "lucide-react";

const mockOportunidades = [
  { id: 1, objeto: "Aquisição de equipamentos de tomografia computadorizada", orgao: "Min. da Saúde", score: 94, tipo: "Core Business", risco: "Baixo", valor: "R$ 2.450.000" },
  { id: 2, objeto: "Contratação de software de gestão laboratorial", orgao: "ANVISA", score: 87, tipo: "Core Business", risco: "Baixo", valor: "R$ 560.000" },
  { id: 3, objeto: "Manutenção de equipamentos hospitalares", orgao: "Hospital das Forças Armadas", score: 82, tipo: "Core Business", risco: "Médio", valor: "R$ 1.100.000" },
  { id: 4, objeto: "Serviços de manutenção de rede de dados", orgao: "INSS", score: 45, tipo: "Oportunidade Lateral", risco: "Alto", valor: "R$ 890.000" },
  { id: 5, objeto: "Fornecimento de mobiliário escolar", orgao: "Min. da Educação", score: 12, tipo: "Fora do Escopo", risco: "Alto", valor: "R$ 1.200.000" },
];

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? "text-success bg-success/10" : score >= 50 ? "text-warning bg-warning/10" : "text-destructive bg-destructive/10";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold ${color}`}>
      <Star className="h-3.5 w-3.5" />
      {score}
    </span>
  );
}

export default function OportunidadesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Oportunidades</h1>
        <p className="text-sm text-muted-foreground">Ranking de licitações por score de aderência</p>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
        {mockOportunidades.map((op, i) => (
          <motion.div
            key={op.id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="group flex items-center gap-4 rounded-xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md cursor-pointer"
          >
            <ScoreBadge score={op.score} />
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-foreground truncate">{op.objeto}</h3>
              <p className="text-sm text-muted-foreground">{op.orgao}</p>
            </div>
            <div className="hidden md:flex items-center gap-6 text-sm">
              <div>
                <p className="text-muted-foreground">Tipo</p>
                <p className="font-medium text-foreground">{op.tipo}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Valor</p>
                <p className="font-medium text-foreground">{op.valor}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Risco</p>
                <p className={`font-medium ${op.risco === "Baixo" ? "text-success" : op.risco === "Médio" ? "text-warning" : "text-destructive"}`}>{op.risco}</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
