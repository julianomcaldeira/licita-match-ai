import { motion } from "framer-motion";
import { Search, Filter, Calendar, ArrowUpDown } from "lucide-react";

const mockData = [
  { id: "PNCP-2026-001", orgao: "Min. da Saúde", objeto: "Aquisição de equipamentos de tomografia", modalidade: "Pregão Eletrônico", valor: "R$ 2.450.000", data: "2026-02-20", situacao: "Homologada" },
  { id: "PNCP-2026-002", orgao: "INSS", objeto: "Serviços de manutenção de rede de dados", modalidade: "Concorrência", valor: "R$ 890.000", data: "2026-02-19", situacao: "Em andamento" },
  { id: "PNCP-2026-003", orgao: "Min. da Educação", objeto: "Fornecimento de mobiliário escolar", modalidade: "Pregão Eletrônico", valor: "R$ 1.200.000", data: "2026-02-18", situacao: "Homologada" },
  { id: "PNCP-2026-004", orgao: "ANVISA", objeto: "Contratação de software de gestão laboratorial", modalidade: "Pregão Eletrônico", valor: "R$ 560.000", data: "2026-02-17", situacao: "Publicada" },
  { id: "PNCP-2026-005", orgao: "DNIT", objeto: "Obras de pavimentação em rodovia federal", modalidade: "Concorrência", valor: "R$ 15.700.000", data: "2026-02-16", situacao: "Homologada" },
];

export default function LicitacoesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Licitações</h1>
        <p className="text-sm text-muted-foreground">Dados ingeridos do PNCP e Portal da Transparência</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Buscar por objeto, órgão..."
            className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button className="flex h-10 items-center gap-2 rounded-lg border border-input bg-card px-4 text-sm text-muted-foreground hover:bg-secondary">
          <Filter className="h-4 w-4" /> Filtros
        </button>
        <button className="flex h-10 items-center gap-2 rounded-lg border border-input bg-card px-4 text-sm text-muted-foreground hover:bg-secondary">
          <Calendar className="h-4 w-4" /> Período
        </button>
      </div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">ID</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Órgão</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Objeto</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Modalidade</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Valor</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Data</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Situação</th>
            </tr>
          </thead>
          <tbody>
            {mockData.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0 transition hover:bg-secondary/30 cursor-pointer">
                <td className="px-4 py-3 font-mono text-xs text-primary">{row.id}</td>
                <td className="px-4 py-3 font-medium text-foreground">{row.orgao}</td>
                <td className="px-4 py-3 max-w-xs truncate text-foreground">{row.objeto}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.modalidade}</td>
                <td className="px-4 py-3 font-medium text-foreground">{row.valor}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.data}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    row.situacao === "Homologada" ? "bg-success/10 text-success" :
                    row.situacao === "Em andamento" ? "bg-warning/10 text-warning" :
                    "bg-info/10 text-info"
                  }`}>
                    {row.situacao}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>
    </div>
  );
}
