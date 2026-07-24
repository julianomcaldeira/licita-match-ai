import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Wallet,
  Gavel,
  FileSignature,
  Banknote,
  TrendingDown,
  Tag,
  Clock,
  Layers,
  Check,
  Sparkles,
  Shield,
  Zap,
  BarChart3,
  Search,
  Target,
  Building2,
  Star,
  PlayCircle,
  ChevronRight,
} from "lucide-react";
import logoImg from "@/assets/logo-ipesquisei-indigo.png";
import heroImg from "@/assets/landing-hero.jpg";
import dashboardImg from "@/assets/landing-dashboard.jpg";
import intelImg from "@/assets/landing-intel.jpg";

const palette = {
  bg: "#f8fafc",
  bg2: "#eef2ff",
  accent: "#4f46e5",
  accentDark: "#3730a3",
  accentSoft: "#c7d2fe",
};

const nav = [
  { label: "O ciclo", href: "#ciclo" },
  { label: "Plataforma", href: "#plataforma" },
  { label: "Descobertas", href: "#descobre" },
  { label: "Planos", href: "#planos" },
  { label: "FAQ", href: "#faq" },
];

const stats = [
  { value: "R$ 1,2 tri", label: "movimentados em compras públicas por ano" },
  { value: "+180 mil", label: "editais monitorados em tempo real" },
  { value: "+6 milhões", label: "contratos e empenhos indexados" },
  { value: "5.570", label: "municípios e órgãos cobertos" },
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

const plataforma = [
  {
    icon: Search,
    title: "Busca profunda",
    desc: "Filtre por CNPJ, objeto, item, órgão, esfera, modalidade e faixa de valor. Encontra o que ferramenta nenhuma acha.",
  },
  {
    icon: BarChart3,
    title: "Painéis por segmento",
    desc: "Saúde, TI, obras, alimentos. KPIs recalculados a cada filtro, com evolução mês a mês.",
  },
  {
    icon: Target,
    title: "Radar de concorrentes",
    desc: "Quem venceu, com quanto de desconto, contra quem. Timeline de disputa por objeto e por órgão.",
  },
  {
    icon: Shield,
    title: "Score de bom pagador",
    desc: "Órgãos rankeados AAA a D com base em empenho, liquidação e pagamento reais — não em achismo.",
  },
  {
    icon: Zap,
    title: "Ingestão em tempo real",
    desc: "PNCP e fontes oficiais federais atualizadas todos os dias. Nada é perdido: cobertura auditada por rotina automática.",
  },
  {
    icon: Sparkles,
    title: "API pronta pra integrar",
    desc: "Puxe licitações, contratos e empenhos direto para seu CRM ou BI. Chave por cliente, com escopo isolado.",
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

const depoimentos = [
  {
    nome: "Fernanda M.",
    cargo: "Diretora Comercial · Saúde",
    texto:
      "Em duas semanas mapeamos onde nossos concorrentes estavam ganhando. Reposicionamos preço e fechamos três contratos em um mês.",
  },
  {
    nome: "Ricardo A.",
    cargo: "Sócio · Consultoria B2G",
    texto:
      "O score de bom pagador virou nosso primeiro filtro. Paramos de gastar energia em órgão que atrasa 300 dias pra pagar.",
  },
  {
    nome: "Juliana T.",
    cargo: "Head de Vendas · TI",
    texto:
      "A API do i-pesquisei alimenta nosso CRM direto. Zeramos planilha, dobramos a base de oportunidade qualificada.",
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
    cta: "Assinar Inteligência",
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
    cta: "Assinar Execução",
    highlight: true,
    badge: "Mais escolhido",
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
    cta: "Assinar Canal",
    highlight: false,
  },
];

const faq = [
  {
    q: "Preciso falar com vendedor pra assinar?",
    a: "Não. Todo o processo é online. Você escolhe o plano, cadastra empresa e cartão e já está usando em segundos.",
  },
  {
    q: "Como funciona o teste grátis?",
    a: "7 dias com acesso completo ao plano escolhido. Sem cartão pra começar. Cancela na hora se não fizer sentido.",
  },
  {
    q: "De onde vêm os dados?",
    a: "Fontes oficiais do governo brasileiro — PNCP, Portal da Transparência, SIAFI, SICONFI. Atualização diária, com auditoria automática de cobertura.",
  },
  {
    q: "Consigo integrar com meu CRM?",
    a: "Sim. Nos planos Execução e Canal você recebe uma chave de API escopada por cliente, com endpoints prontos pra licitações, contratos e empenhos.",
  },
  {
    q: "E se eu quiser cancelar?",
    a: "Um clique. Sem multa, sem retenção, sem ligação de retenção. Volta quando quiser.",
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
          className="absolute inset-0 opacity-[0.16]"
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
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
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
              className="group inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
              style={{ background: palette.accent, boxShadow: `0 8px 30px ${palette.accent}55` }}
            >
              Começar teste grátis
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative z-10 mx-auto grid max-w-7xl gap-14 px-6 pb-24 pt-16 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-300 bg-indigo-100 px-3 py-1 text-xs text-indigo-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />
            Do orçamento ao pagamento — o ciclo completo do dinheiro público
          </div>
          <h1 className="font-display mt-6 max-w-2xl text-5xl font-semibold leading-[1.05] tracking-tight text-slate-900 sm:text-6xl lg:text-[68px]">
            Enxergue onde está o dinheiro público{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: `linear-gradient(120deg, #0f172a 0%, ${palette.accent} 65%, #6366f1 100%)`,
              }}
            >
              antes, durante e depois.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
            Descubra oportunidades antes do edital, saiba quais órgãos pagam bem e em quanto
            tempo, e enxergue onde há verba alocada que ainda vai virar compra — tudo no
            mesmo lugar.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-white transition hover:brightness-110"
              style={{ background: palette.accent, boxShadow: `0 10px 40px ${palette.accent}66` }}
            >
              Começar teste grátis de 7 dias
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#planos"
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              <PlayCircle className="h-4 w-4 text-indigo-600" />
              Ver planos e preços
            </a>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            7 dias grátis · cancele quando quiser · sem cartão para começar
          </p>

          {/* mini trust row */}
          <div className="mt-10 grid grid-cols-2 gap-4 border-t border-slate-200 pt-6 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="font-display text-2xl font-semibold text-slate-900">{s.value}</div>
                <div className="mt-1 text-[11px] leading-snug text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.15 }}
          className="relative"
        >
          <div
            className="absolute -inset-6 -z-10 rounded-[36px] blur-2xl"
            style={{ background: `linear-gradient(140deg, ${palette.accent}44, transparent 70%)` }}
          />
          <div className="overflow-hidden rounded-3xl border border-indigo-200 bg-slate-900 shadow-[0_40px_120px_-20px_rgba(79,70,229,0.55)]">
            <img
              src={heroImg}
              alt="Visualização do ciclo do dinheiro público"
              width={1600}
              height={1200}
              className="h-full w-full object-cover"
            />
          </div>
          {/* Floating badges */}
          <div className="absolute -left-6 top-10 hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-xl md:block">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-100">
                <Shield className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-widest text-slate-500">
                  Score de órgão
                </div>
                <div className="font-display text-lg font-semibold text-slate-900">
                  AAA · paga em 22d
                </div>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-6 right-4 hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-xl md:block">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-100">
                <TrendingDown className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-widest text-slate-500">
                  Deixado na mesa
                </div>
                <div className="font-display text-lg font-semibold text-slate-900">
                  R$ 42,7 mi · seu segmento
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* LOGO STRIP */}
      <section className="relative z-10 border-y border-slate-200 bg-white/70">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-6 py-8 sm:flex-row sm:justify-between">
          <p className="text-xs uppercase tracking-widest text-slate-500">
            Usado por empresas que vendem para o governo em todo o Brasil
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-slate-400">
            {["Saúde", "TI", "Obras", "Alimentos", "Serviços", "Educação"].map((s) => (
              <span key={s} className="font-display text-sm font-semibold tracking-wide">
                {s}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* CICLO */}
      <section id="ciclo" className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        <div className="mb-14 max-w-3xl">
          <span className="font-mono text-xs uppercase tracking-widest text-indigo-600">
            / o ciclo do dinheiro público
          </span>
          <h2 className="font-display mt-3 text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">
            Quatro etapas. Uma única plataforma.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            A maioria das ferramentas só olha para o edital. O i-pesquisei acompanha o dinheiro
            público desde o orçamento até o pagamento final ao fornecedor.
          </p>
        </div>

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
                <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 transition hover:-translate-y-1 hover:border-indigo-400 hover:shadow-lg">
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

        <div className="mt-12 flex justify-center">
          <Link
            to="/auth"
            className="group inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-white transition hover:brightness-110"
            style={{ background: palette.accent, boxShadow: `0 10px 30px ${palette.accent}55` }}
          >
            Testar o ciclo completo grátis
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>

      {/* PLATAFORMA — feature grid with dashboard image */}
      <section id="plataforma" className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        <div className="grid gap-14 lg:grid-cols-[1fr_1.15fr] lg:items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="relative"
          >
            <div
              className="absolute -inset-4 -z-10 rounded-[36px] blur-2xl"
              style={{ background: `linear-gradient(140deg, ${palette.accent}33, transparent 70%)` }}
            />
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_30px_80px_-20px_rgba(15,23,42,0.25)]">
              <img
                src={dashboardImg}
                alt="Painel do i-pesquisei"
                width={1600}
                height={1104}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
          </motion.div>

          <div>
            <span className="font-mono text-xs uppercase tracking-widest text-indigo-600">
              / a plataforma
            </span>
            <h2 className="font-display mt-3 text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">
              Um cockpit para inteligência B2G.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-600">
              Painéis, filtros e API. Feito para quem já vende ao governo e quer parar de perder
              tempo em ferramenta ruim.
            </p>

            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {plataforma.map((f) => (
                <div
                  key={f.title}
                  className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:border-indigo-400 hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-indigo-200"
                      style={{ background: `${palette.accent}12` }}
                    >
                      <f.icon className="h-4 w-4 text-indigo-600" />
                    </div>
                    <div>
                      <div className="font-display text-sm font-semibold text-slate-900">
                        {f.title}
                      </div>
                      <div className="mt-1 text-xs leading-relaxed text-slate-600">{f.desc}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white transition hover:brightness-110"
                style={{ background: palette.accent, boxShadow: `0 8px 24px ${palette.accent}55` }}
              >
                Entrar na plataforma
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#planos"
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Ver planos
                <ChevronRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* O QUE VOCÊ DESCOBRE */}
      <section id="descobre" className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        <div className="grid gap-14 lg:grid-cols-[1fr_1.2fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <span className="font-mono text-xs uppercase tracking-widest text-indigo-600">
              / o que você descobre
            </span>
            <h2 className="font-display mt-3 text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">
              Respostas que hoje você não tem.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-600">
              Não são gráficos genéricos. São as perguntas que decidem se vale a pena disputar.
            </p>
            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <img
                src={intelImg}
                alt="Inteligência sobre compras públicas"
                width={1200}
                height={1200}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
            <Link
              to="/auth"
              className="mt-6 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white transition hover:brightness-110"
              style={{ background: palette.accent, boxShadow: `0 8px 24px ${palette.accent}55` }}
            >
              Ver essas respostas nos meus dados
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {descobre.map((d, i) => (
              <motion.div
                key={d.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
                className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-7 transition hover:-translate-y-1 hover:border-indigo-400 hover:shadow-lg"
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
        </div>
      </section>

      {/* DEPOIMENTOS */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        <div className="mb-14 max-w-3xl">
          <span className="font-mono text-xs uppercase tracking-widest text-indigo-600">
            / quem já usa
          </span>
          <h2 className="font-display mt-3 text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">
            Times comerciais que trocaram achismo por dado.
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {depoimentos.map((d, i) => (
            <motion.div
              key={d.nome}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-7"
            >
              <div className="mb-3 flex gap-1 text-indigo-500">
                {Array.from({ length: 5 }).map((_, k) => (
                  <Star key={k} className="h-4 w-4 fill-current" />
                ))}
              </div>
              <p className="text-sm leading-relaxed text-slate-700">"{d.texto}"</p>
              <div className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-4">
                <div
                  className="grid h-9 w-9 place-items-center rounded-full font-display text-sm font-semibold text-white"
                  style={{ background: palette.accent }}
                >
                  {d.nome[0]}
                </div>
                <div>
                  <div className="font-display text-sm font-semibold text-slate-900">
                    {d.nome}
                  </div>
                  <div className="text-xs text-slate-500">{d.cargo}</div>
                </div>
              </div>
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
                  ? "border-indigo-400 bg-white shadow-[0_30px_80px_-30px_rgba(79,70,229,0.55)] lg:-translate-y-3"
                  : "border-slate-200 bg-white/70 hover:border-indigo-300"
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
                    ? "text-white hover:brightness-110"
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

      {/* FAQ */}
      <section id="faq" className="relative z-10 mx-auto max-w-4xl px-6 py-24">
        <div className="mb-14 text-center">
          <span className="font-mono text-xs uppercase tracking-widest text-indigo-600">
            / perguntas frequentes
          </span>
          <h2 className="font-display mt-3 text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">
            Antes de assinar, provavelmente você quer saber:
          </h2>
        </div>
        <div className="space-y-3">
          {faq.map((f, i) => (
            <details
              key={i}
              className="group rounded-2xl border border-slate-200 bg-white p-6 open:border-indigo-300 open:shadow-md"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                <span className="font-display text-base font-semibold text-slate-900">
                  {f.q}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-indigo-600 transition group-open:rotate-90" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{f.a}</p>
            </details>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-white transition hover:brightness-110"
            style={{ background: palette.accent, boxShadow: `0 10px 40px ${palette.accent}55` }}
          >
            Começar agora — 7 dias grátis
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* CHAMADA FINAL */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <div
          className="relative overflow-hidden rounded-3xl border border-indigo-300 p-10 text-center lg:p-16"
          style={{
            background: `linear-gradient(140deg, ${palette.accentSoft}, ${palette.bg2})`,
            boxShadow: `0 40px 120px -20px ${palette.accent}55`,
          }}
        >
          <div
            className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[70%] -translate-x-1/2 rounded-full blur-3xl opacity-40"
            style={{ background: palette.accent }}
          />
          <div className="relative">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-indigo-400 bg-white/70 px-3 py-1 text-xs text-indigo-700">
              <Sparkles className="h-3.5 w-3.5" />
              7 dias grátis · sem cartão
            </div>
            <h2 className="font-display mx-auto mt-4 max-w-3xl text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">
              Um único contrato público vale muito mais que a assinatura anual.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-700">
              Comece com 7 dias grátis. Se em uma semana o i-pesquisei não te mostrar uma
              oportunidade que valha a assinatura, você cancela sem custo.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-white transition hover:brightness-110"
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
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 mx-auto max-w-7xl px-6 pb-12 pt-6">
        <div className="flex flex-col items-start justify-between gap-4 border-t border-slate-200 pt-8 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-indigo-600" />
            <span className="font-mono text-xs text-slate-500">
              i-pesquisei · inteligência sobre o ciclo do dinheiro público
            </span>
          </div>
          <div className="flex items-center gap-6 text-xs text-slate-500">
            <a href="#ciclo" className="hover:text-slate-900">O ciclo</a>
            <a href="#plataforma" className="hover:text-slate-900">Plataforma</a>
            <a href="#planos" className="hover:text-slate-900">Planos</a>
            <a href="#faq" className="hover:text-slate-900">FAQ</a>
            <Link to="/auth" className="hover:text-slate-900">Entrar</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
