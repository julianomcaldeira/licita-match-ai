import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useState } from "react";
import {
  ArrowRight,
  Database,
  ShieldCheck,
  Trophy,
  Target,
  Users,
  Bell,
  Layers,
  Gauge,
  Cpu,
  Sparkles,
  Check,
  CalendarCheck,
} from "lucide-react";
import logoImg from "@/assets/logo-ipesquisei-indigo.png";

/**
 * Landing pública — i-pesquisei
 * Posicionamento: inteligência em compras governamentais.
 * Objetivo: captação de leads para venda consultiva (sem autoatendimento).
 * Paleta: Midnight Indigo | Tipografia: Space Grotesk + DM Sans
 */

const palette = {
  bg: "#f8fafc",
  bg2: "#eef2ff",
  accent: "#4f46e5",
  accentSoft: "#c7d2fe",
};

const nav = [
  { label: "O que você enxerga", href: "#recorte" },
  { label: "Diferenciais", href: "#diferenciais" },
  { label: "Planos", href: "#planos" },
  { label: "Contato", href: "#contato" },
];

const recortes = [
  {
    icon: Trophy,
    tag: "Minhas Vitórias",
    title: "Tudo que sua empresa já ganhou.",
    desc: "Consolidamos, por CNPJ, todos os contratos e homologações da sua empresa e das coligadas — com valores, órgãos, prazos e itens. Nunca mais monte planilha para saber o próprio histórico.",
  },
  {
    icon: Target,
    tag: "Minhas Oportunidades",
    title: "Licitações abertas com a sua cara.",
    desc: "Editais abertos são pontuados pelo fit com o perfil da sua empresa: aderência ao objeto, faixa de valor, região de atuação e histórico de vencedores. Você vê primeiro o que faz sentido disputar.",
  },
  {
    icon: Users,
    tag: "Meus Concorrentes",
    title: "Quem mais ganha no seu segmento.",
    desc: "Mapeamento dos concorrentes ativos por objeto, região e órgão. Descubra quem venceu, com que preço, com que frequência — e onde há espaço para você entrar.",
  },
  {
    icon: Bell,
    tag: "Meu Radar",
    title: "Alertas proativos de novos editais.",
    desc: "Radar diário que avisa quando surge um edital aderente ao seu perfil ou publicado por um órgão que você acompanha. Você recebe antes de precisar procurar.",
  },
];

const diferenciais = [
  {
    icon: Layers,
    title: "Consolidação de fontes",
    desc: "PNCP, Portal da Transparência, empenhos e base de empresas sancionadas em um só lugar — cruzados por CNPJ, órgão e contrato. O PNCP mostra editais; nós mostramos o ciclo completo.",
  },
  {
    icon: Gauge,
    title: "Score de órgãos",
    desc: "Cada órgão recebe uma nota AAA–D de bom pagador, calculada com Portal da Transparência, SICONFI e histórico de contratos. Você entra na disputa sabendo se vai receber.",
  },
  {
    icon: Cpu,
    title: "Análise de mercado por IA",
    desc: "Leitura automática do edital, tabela de itens e recomendações. Cruzamento com histórico do órgão, dos vencedores e do próprio mercado — sem depender de leitura humana do PDF.",
  },
  {
    icon: Sparkles,
    title: "Índice StartGi de Compras Governamentais",
    desc: "Índice proprietário que sintetiza volume, dispersão de fornecedores, ticket médio e velocidade de contratação por segmento e região. Uma leitura de mercado que o portal público não entrega.",
  },
];

const planos = [
  {
    name: "Essencial",
    desc: "Para times que estão estruturando a operação de vendas para o governo.",
    features: [
      "Minhas Vitórias e Minhas Oportunidades",
      "Score de órgãos",
      "Consolidação PNCP + Portal da Transparência",
      "Até 3 usuários",
    ],
    highlight: false,
  },
  {
    name: "Profissional",
    desc: "Para operações recorrentes que precisam de inteligência competitiva e IA por edital.",
    features: [
      "Tudo do Essencial",
      "Meus Concorrentes e Meu Radar",
      "Análise IA por licitação",
      "Índice StartGi de Compras Governamentais",
      "Relatórios exportáveis e usuários adicionais",
    ],
    highlight: true,
  },
  {
    name: "Enterprise / Canal",
    desc: "Para consultorias, escritórios e canais que atendem múltiplos clientes.",
    features: [
      "Tudo do Profissional",
      "Ambiente white-label com sua marca",
      "API para integração com CRM e BI",
      "Múltiplos CNPJs e workspaces",
      "SLA dedicado e onboarding assistido",
    ],
    highlight: false,
  },
];

export default function LandingPage() {
  const [form, setForm] = useState({ nome: "", empresa: "", email: "", telefone: "" });
  const [enviado, setEnviado] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const assunto = encodeURIComponent("Demonstração i-pesquisei");
    const corpo = encodeURIComponent(
      `Nome: ${form.nome}\nEmpresa: ${form.empresa}\nE-mail: ${form.email}\nTelefone: ${form.telefone}\n\nGostaria de agendar uma demonstração do i-pesquisei.`,
    );
    window.location.href = `mailto:contato@ipesquisei.com.br?subject=${assunto}&body=${corpo}`;
    setEnviado(true);
  };

  return (
    <div
      className="min-h-screen font-sans text-slate-700 antialiased"
      style={{ background: palette.bg, fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif" }}
    >
      {/* Ambient grid + glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(79,70,229,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(79,70,229,0.08) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
        <div
          className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full blur-[160px] opacity-30"
          style={{ background: `radial-gradient(circle, ${palette.accent} 0%, transparent 70%)` }}
        />
        <div
          className="absolute bottom-0 right-0 h-[500px] w-[500px] rounded-full blur-[160px] opacity-20"
          style={{ background: `radial-gradient(circle, ${palette.accentSoft} 0%, transparent 70%)` }}
        />
      </div>

      {/* NAV */}
      <header className="relative z-20 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center">
            <img src={logoImg} alt="i-pesquisei" className="h-7 w-auto object-contain md:h-8" />
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            {nav.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="text-sm text-slate-500 transition hover:text-slate-900"
              >
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link
              to="/auth"
              className="hidden text-sm text-slate-600 hover:text-slate-900 sm:inline"
            >
              Entrar
            </Link>
            <a
              href="#contato"
              className="group inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white transition"
              style={{ background: palette.accent, boxShadow: `0 8px 30px ${palette.accent}55` }}
            >
              Agende uma demonstração
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </a>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-20 pt-16 text-center lg:pt-24">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-indigo-300 bg-indigo-100 px-3 py-1 text-xs text-indigo-600">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
            Inteligência em compras governamentais
          </div>
          <h1 className="font-display mx-auto mt-6 max-w-4xl text-5xl font-semibold leading-[1.05] tracking-tight text-slate-900 sm:text-6xl lg:text-7xl">
            O que sua empresa já ganhou —{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: `linear-gradient(120deg, #0f172a 0%, ${palette.accent} 70%, #6366f1 100%)`,
              }}
            >
              e o que está aberto pra ela agora.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
            O i-pesquisei mostra, no mesmo lugar, todo o histórico de contratos da sua empresa
            com o governo e as oportunidades abertas que combinam com o seu perfil. Sem
            navegar em portais públicos, sem montar planilha, sem depender de sorte.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#contato"
              className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-white transition"
              style={{ background: palette.accent, boxShadow: `0 10px 40px ${palette.accent}66` }}
            >
              Agende uma demonstração
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#recorte"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Ver o que você enxerga
            </a>
          </div>
        </motion.div>
      </section>

      {/* O QUE VOCÊ ENXERGA */}
      <section id="recorte" className="relative z-10 mx-auto max-w-7xl px-6 py-20">
        <div className="mb-14 max-w-3xl">
          <span className="font-mono text-xs uppercase tracking-widest text-indigo-600">
            / o que você enxerga
          </span>
          <h2 className="font-display mt-3 text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">
            Quatro visões da sua operação com o governo.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            O produto é organizado a partir do seu ponto de vista — a sua empresa, o seu
            segmento, os seus concorrentes — e não a partir do organograma do Estado.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {recortes.map((r, i) => (
            <motion.div
              key={r.tag}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-8 transition hover:border-indigo-400"
            >
              <div
                className="absolute inset-x-0 top-0 h-px opacity-0 transition group-hover:opacity-100"
                style={{
                  background: `linear-gradient(90deg, transparent, ${palette.accent}, transparent)`,
                }}
              />
              <div className="flex items-start justify-between">
                <div
                  className="grid h-12 w-12 place-items-center rounded-xl border border-indigo-300"
                  style={{ background: `${palette.accent}18` }}
                >
                  <r.icon className="h-5 w-5 text-indigo-600" />
                </div>
                <span className="font-mono text-[11px] uppercase tracking-widest text-indigo-600">
                  {r.tag}
                </span>
              </div>
              <h3 className="font-display mt-6 text-xl font-semibold text-slate-900">
                {r.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{r.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* DIFERENCIAIS — Por que não é só o PNCP */}
      <section id="diferenciais" className="relative z-10 mx-auto max-w-7xl px-6 py-20">
        <div className="mb-14 max-w-3xl">
          <span className="font-mono text-xs uppercase tracking-widest text-indigo-600">
            / por que não é só o PNCP
          </span>
          <h2 className="font-display mt-3 text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">
            O portal público mostra o edital. Nós mostramos o mercado.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            O PNCP entrega documentos. O i-pesquisei entrega leitura de mercado: fontes
            cruzadas, órgãos avaliados, análise por IA e um índice próprio de compras
            governamentais.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {diferenciais.map((d, i) => (
            <motion.div
              key={d.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className="relative rounded-2xl border border-slate-200 bg-white p-8"
            >
              <div
                className="mb-5 grid h-11 w-11 place-items-center rounded-xl border border-indigo-300"
                style={{ background: `${palette.accent}18` }}
              >
                <d.icon className="h-5 w-5 text-indigo-600" />
              </div>
              <h3 className="font-display text-lg font-semibold text-slate-900">{d.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{d.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* PLANOS */}
      <section id="planos" className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        <div className="mb-14 max-w-3xl">
          <span className="font-mono text-xs uppercase tracking-widest text-indigo-600">
            / planos
          </span>
          <h2 className="font-display mt-3 text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">
            Três formatos, adaptados ao tamanho da operação.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            Trabalhamos em modelo consultivo. O time avalia o seu contexto, dimensiona o
            plano ideal e conduz o onboarding.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {planos.map((p) => (
            <div
              key={p.name}
              className={`relative flex flex-col rounded-2xl border p-8 transition ${
                p.highlight
                  ? "border-indigo-400 bg-white shadow-[0_30px_80px_-30px_rgba(79,70,229,0.45)]"
                  : "border-slate-200 bg-white/70"
              }`}
            >
              {p.highlight && (
                <span
                  className="absolute -top-3 left-8 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-white"
                  style={{ background: palette.accent }}
                >
                  Mais adotado
                </span>
              )}
              <div className="font-display text-xl font-semibold text-slate-900">{p.name}</div>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{p.desc}</p>
              <ul className="mt-6 flex-1 space-y-3 text-sm text-slate-700">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <a
                href="#contato"
                className={`mt-8 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition ${
                  p.highlight
                    ? "text-white"
                    : "border border-slate-300 text-slate-900 hover:bg-slate-100"
                }`}
                style={
                  p.highlight
                    ? { background: palette.accent, boxShadow: `0 10px 30px ${palette.accent}55` }
                    : undefined
                }
              >
                Fale com o time
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* CTA final + Formulário */}
      <section id="contato" className="relative z-10 mx-auto max-w-6xl px-6 py-24">
        <div
          className="grid grid-cols-1 gap-10 overflow-hidden rounded-3xl border border-indigo-300 p-10 lg:grid-cols-2 lg:p-14"
          style={{
            background: `linear-gradient(140deg, ${palette.accentSoft}, ${palette.bg2})`,
            boxShadow: `0 40px 120px -20px ${palette.accent}55`,
          }}
        >
          <div>
            <CalendarCheck className="h-8 w-8 text-indigo-600" />
            <h2 className="font-display mt-6 text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">
              Agende uma demonstração.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-700">
              Em 30 minutos, o time do i-pesquisei apresenta o produto com dados reais do seu
              CNPJ e do seu segmento — e responde se faz sentido para a sua operação.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-slate-700">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                Demonstração personalizada com o seu histórico
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                Diagnóstico do seu mercado governamental
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                Proposta comercial no formato certo para você
              </li>
            </ul>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"
          >
            <h3 className="font-display text-lg font-semibold text-slate-900">
              Fale com o time
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Retornamos em até 1 dia útil.
            </p>

            <div className="mt-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-600">Nome</label>
                <input
                  required
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  placeholder="Seu nome completo"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Empresa</label>
                <input
                  required
                  value={form.empresa}
                  onChange={(e) => setForm({ ...form, empresa: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  placeholder="Razão social ou fantasia"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-slate-600">E-mail</label>
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    placeholder="voce@empresa.com"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Telefone</label>
                  <input
                    required
                    value={form.telefone}
                    onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    placeholder="(11) 99999-0000"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-white transition"
                style={{
                  background: palette.accent,
                  boxShadow: `0 10px 30px ${palette.accent}55`,
                }}
              >
                Agendar demonstração
                <ArrowRight className="h-4 w-4" />
              </button>

              {enviado && (
                <p className="text-center text-xs text-emerald-700">
                  Abrimos seu cliente de e-mail com a mensagem pronta. Se preferir, escreva
                  direto para contato@ipesquisei.com.br.
                </p>
              )}
            </div>
          </form>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 mx-auto max-w-7xl px-6 pb-12 pt-6">
        <div className="flex flex-col items-start justify-between gap-4 border-t border-slate-200 pt-8 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-indigo-600" />
            <span className="font-mono text-xs text-slate-500">
              i-pesquisei · inteligência em compras governamentais
            </span>
          </div>
          <div className="flex items-center gap-6 text-xs text-slate-500">
            <a href="#recorte" className="hover:text-slate-900">O produto</a>
            <a href="#diferenciais" className="hover:text-slate-900">Diferenciais</a>
            <a href="#planos" className="hover:text-slate-900">Planos</a>
            <a href="#contato" className="hover:text-slate-900">Contato</a>
            <Link to="/auth" className="hover:text-slate-900">Entrar</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
