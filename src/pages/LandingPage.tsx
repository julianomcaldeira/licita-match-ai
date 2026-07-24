import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Database,
  Wallet,
  Gavel,
  FileSignature,
  Banknote,
  TrendingDown,
  Tag,
  Clock,
  Layers,
  Check,
} from "lucide-react";
import logoImg from "@/assets/logo-ipesquisei-indigo.png";

/**
 * Landing pública — i-pesquisei
 * Posicionamento: inteligência sobre todo o ciclo do dinheiro público.
 * Modelo: 100% self-service, assinatura online, sem "fale com vendedor".
 */

const palette = {
  bg: "#f8fafc",
  bg2: "#eef2ff",
  accent: "#4f46e5",
  accentSoft: "#c7d2fe",
};

const nav = [
  { label: "O ciclo", href: "#ciclo" },
  { label: "O que você descobre", href: "#descobre" },
  { label: "Planos", href: "#planos" },
];

const ciclo = [
  {
    icon: Wallet,
    fase: "Antes",
    title: "Orçamento e emendas",
    desc: "Verba que ainda vai virar licitação. Você enxerga onde há dinheiro alocado no seu segmento antes do edital sair.",
  },
  {
    icon: Gavel,
    fase: "A disputa",
    title: "Licitações e concorrentes",
    desc: "Editais abertos, preços praticados no mercado e mapeamento de quem disputa contra você — por objeto, órgão e região.",
  },
  {
    icon: FileSignature,
    fase: "O contrato",
    title: "Quem ganhou, por quanto",
    desc: "Contratos homologados, valores, prazos e itens. O histórico completo de quem vende o quê para cada órgão.",
  },
  {
    icon: Banknote,
    fase: "Depois",
    title: "Empenho e pagamento",
    desc: "Esse órgão paga? Em quanto tempo? Score de bom pagador com base em empenho, liquidação e pagamento reais.",
  },
];

const descobre = [
  {
    icon: TrendingDown,
    title: "Dinheiro deixado na mesa",
    desc: "Quanto do seu segmento foi para concorrentes nos últimos meses — por região, por órgão e por faixa de valor.",
  },
  {
    icon: Tag,
    title: "Preço de referência real",
    desc: "O preço praticado do que você vende ao governo, com base em contratos homologados — não em pesquisa de mercado inventada.",
  },
  {
    icon: Clock,
    title: "Órgãos que pagam melhor",
    desc: "Ranking de órgãos por prazo médio de pagamento e taxa de inadimplência, cruzando empenho, liquidação e pagamento.",
  },
  {
    icon: Layers,
    title: "Verba alocada e não comprometida",
    desc: "Onde ainda há orçamento no seu segmento que não virou compra — para você se posicionar antes do edital.",
  },
];

const planos = [
  {
    code: "inteligencia",
    name: "Inteligência",
    price: "R$ 297",
    price_suffix: "/mês",
    tagline: "Para quem já vende ao governo",
    features: [
      "Busca completa de licitações",
      "Preço de referência real",
      "Potencial de compra por órgão",
      "Atas de registro de preço vigentes",
      "Dinheiro na mesa (segmento)",
      "Concorrentes ativos",
      "Empresas sancionadas",
      "Radar diário de novos editais",
      "3 CNPJs · 5 usuários",
    ],
    cta: "Assinar",
    highlight: false,
  },
  {
    code: "execucao",
    name: "Execução",
    price: "R$ 897",
    price_suffix: "/mês",
    tagline: "Para quem tem contratos públicos",
    features: [
      "Tudo do Inteligência",
      "Ficha completa do órgão",
      "Empenho detalhado (empenho, liquidação, pagamento)",
      "Emendas parlamentares",
      "Sazonalidade de compras",
      "Janela de recompra",
      "API para integração com CRM/BI",
      "15 CNPJs · 15 usuários",
    ],
    cta: "Assinar",
    highlight: true,
    badge: "Mais completo",
  },
  {
    code: "canal",
    name: "Canal",
    price: "A partir de R$ 1.997",
    price_suffix: "/mês",
    tagline: "Para consultorias e escritórios",
    features: [
      "Ambiente white-label com sua marca",
      "Painel multi-cliente",
      "API completa",
      "Suporte dedicado",
      "Preço por faixa de clientes finais atendidos",
    ],
    cta: "Assinar",
    highlight: false,
  },
];

export default function LandingPage() {
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
            <Link
              to="/auth"
              className="group inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white transition"
              style={{ background: palette.accent, boxShadow: `0 8px 30px ${palette.accent}55` }}
            >
              Começar teste grátis
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
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
            Do orçamento ao pagamento — o ciclo completo do dinheiro público
          </div>
          <h1 className="font-display mx-auto mt-6 max-w-4xl text-5xl font-semibold leading-[1.05] tracking-tight text-slate-900 sm:text-6xl lg:text-7xl">
            Enxergue onde está o dinheiro público{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: `linear-gradient(120deg, #0f172a 0%, ${palette.accent} 70%, #6366f1 100%)`,
              }}
            >
              antes, durante e depois.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
            Sua empresa descobre oportunidades antes do edital, sabe quais órgãos pagam bem
            e em quanto tempo, e enxerga onde há verba alocada que ainda vai virar compra —
            tudo no mesmo lugar.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#planos"
              className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-white transition"
              style={{ background: palette.accent, boxShadow: `0 10px 40px ${palette.accent}66` }}
            >
              Ver planos
              <ArrowRight className="h-4 w-4" />
            </a>
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Começar teste grátis
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            7 dias grátis · cancele quando quiser · sem cartão para começar
          </p>
        </motion.div>
      </section>

      {/* CICLO DO DINHEIRO PÚBLICO */}
      <section id="ciclo" className="relative z-10 mx-auto max-w-7xl px-6 py-20">
        <div className="mb-14 max-w-3xl">
          <span className="font-mono text-xs uppercase tracking-widest text-indigo-600">
            / o ciclo do dinheiro público
          </span>
          <h2 className="font-display mt-3 text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">
            Quatro etapas. Uma única plataforma.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            A maioria das ferramentas só olha para o edital. O i-pesquisei acompanha o
            dinheiro público desde o orçamento até o pagamento final ao fornecedor.
          </p>
        </div>

        {/* Timeline */}
        <div className="relative">
          <div
            className="absolute left-0 right-0 top-6 hidden h-px md:block"
            style={{
              background: `linear-gradient(90deg, transparent, ${palette.accentSoft}, ${palette.accent}, ${palette.accentSoft}, transparent)`,
            }}
          />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
            {ciclo.map((c, i) => (
              <motion.div
                key={c.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="relative"
              >
                <div
                  className="relative z-10 mx-auto grid h-12 w-12 place-items-center rounded-full border border-indigo-300 bg-white"
                  style={{ boxShadow: `0 6px 20px ${palette.accent}22` }}
                >
                  <c.icon className="h-5 w-5 text-indigo-600" />
                </div>
                <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-6">
                  <span className="font-mono text-[11px] uppercase tracking-widest text-indigo-600">
                    {c.fase}
                  </span>
                  <h3 className="font-display mt-2 text-lg font-semibold text-slate-900">
                    {c.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{c.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* O QUE VOCÊ DESCOBRE */}
      <section id="descobre" className="relative z-10 mx-auto max-w-7xl px-6 py-20">
        <div className="mb-14 max-w-3xl">
          <span className="font-mono text-xs uppercase tracking-widest text-indigo-600">
            / o que você descobre
          </span>
          <h2 className="font-display mt-3 text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">
            Respostas que hoje você não tem.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            Não são gráficos genéricos. São as perguntas que decidem se vale a pena disputar.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {descobre.map((d, i) => (
            <motion.div
              key={d.title}
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
            Escolha o plano e comece a usar hoje.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            100% online. Sem reunião, sem proposta, sem espera. Assinou, está usando.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {planos.map((p) => (
            <div
              key={p.code}
              className={`relative flex flex-col rounded-2xl border p-8 transition ${
                p.highlight
                  ? "border-indigo-400 bg-white shadow-[0_30px_80px_-30px_rgba(79,70,229,0.45)]"
                  : "border-slate-200 bg-white/70"
              }`}
            >
              {p.highlight && p.badge && (
                <span
                  className="absolute -top-3 left-8 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-white"
                  style={{ background: palette.accent }}
                >
                  {p.badge}
                </span>
              )}
              <div className="font-display text-xl font-semibold text-slate-900">{p.name}</div>
              <p className="mt-1 text-sm text-slate-500">{p.tagline}</p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="font-display text-4xl font-semibold text-slate-900">
                  {p.price}
                </span>
                <span className="text-sm text-slate-500">{p.price_suffix}</span>
              </div>
              <ul className="mt-6 flex-1 space-y-3 text-sm text-slate-700">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/auth"
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
                {p.cta}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col items-center gap-1 text-center text-xs text-slate-500">
          <p>Planos anuais têm 2 meses grátis.</p>
          <p>Teste grátis de 7 dias, com cancelamento a qualquer momento.</p>
        </div>
      </section>

      {/* CHAMADA FINAL */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-24">
        <div
          className="overflow-hidden rounded-3xl border border-indigo-300 p-10 text-center lg:p-16"
          style={{
            background: `linear-gradient(140deg, ${palette.accentSoft}, ${palette.bg2})`,
            boxShadow: `0 40px 120px -20px ${palette.accent}55`,
          }}
        >
          <h2 className="font-display mx-auto max-w-3xl text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">
            Um único contrato público vale muito mais que a assinatura anual.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-700">
            Comece com 7 dias grátis. Se em uma semana o i-pesquisei não te mostrar uma
            oportunidade que valha a assinatura, você cancela sem custo.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-white transition"
              style={{ background: palette.accent, boxShadow: `0 10px 40px ${palette.accent}66` }}
            >
              Começar teste grátis
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#planos"
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Ver planos
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 mx-auto max-w-7xl px-6 pb-12 pt-6">
        <div className="flex flex-col items-start justify-between gap-4 border-t border-slate-200 pt-8 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-indigo-600" />
            <span className="font-mono text-xs text-slate-500">
              i-pesquisei · inteligência sobre o ciclo do dinheiro público
            </span>
          </div>
          <div className="flex items-center gap-6 text-xs text-slate-500">
            <a href="#ciclo" className="hover:text-slate-900">O ciclo</a>
            <a href="#descobre" className="hover:text-slate-900">O que você descobre</a>
            <a href="#planos" className="hover:text-slate-900">Planos</a>
            <Link to="/auth" className="hover:text-slate-900">Entrar</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
