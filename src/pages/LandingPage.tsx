import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Database,
  Sparkles,
  ShieldCheck,
  Activity,
  Building2,
  BarChart3,
  Radar,
  Cpu,
  FileSearch,
  Gauge,
  Check,
} from "lucide-react";
import logoImg from "@/assets/logo-ipesquisei.png";

/**
 * Landing pública — i-pesquisei
 * Paleta: Midnight Indigo  |  Tipografia: Space Grotesk + DM Sans (Inter fallback)
 * Layout: Split-screen hero + seções técnicas do produto.
 * Tom: técnico e orientado a produto (sem tom comercial).
 */

const palette = {
  bg: "#f8fafc",
  bg2: "#eef2ff",
  accent: "#4f46e5",
  accentSoft: "#c7d2fe",
};

const nav = [
  { label: "Plataforma", href: "#plataforma" },
  { label: "Dados", href: "#dados" },
  { label: "IA", href: "#ia" },
  { label: "Score", href: "#score" },
  { label: "Arquitetura", href: "#arquitetura" },
];

const modulos = [
  {
    icon: FileSearch,
    title: "Encontre o edital certo em segundos",
    desc: "Busca inteligente em mais de 918 mil licitações do Brasil inteiro. Filtre por órgão, valor, região e objeto — e descubra oportunidades que seus concorrentes ainda nem viram.",
  },
  {
    icon: Cpu,
    title: "IA que lê o edital por você",
    desc: "Resumo em 3 linhas, tabela de itens e 3 ações recomendadas para cada licitação. Economize horas de leitura e decida em minutos se vale disputar.",
  },
  {
    icon: Gauge,
    title: "Saiba se o órgão paga em dia",
    desc: "Score AAA–D de bom pagador para cada órgão público, cruzando Portal da Transparência, SICONFI e histórico de contratos. Nunca mais entre em disputa às cegas.",
  },
  {
    icon: BarChart3,
    title: "Inteligência competitiva pronta",
    desc: "Veja quem venceu o quê, por quanto e onde. Mapeie concorrentes, identifique nichos rentáveis e ajuste sua estratégia com dados oficiais e atualizados diariamente.",
  },
  {
    icon: ShieldCheck,
    title: "Sua equipe inteira em um só lugar",
    desc: "Multi-usuário com permissões por papel, isolamento total dos seus dados e histórico de tudo que sua equipe pesquisou. Governança sem complicação.",
  },
  {
    icon: Database,
    title: "Dados oficiais, sempre atualizados",
    desc: "Consumimos PNCP e Portal da Transparência todos os dias, automaticamente. Você acessa a informação no dia seguinte ao lançamento — sem planilha, sem gambiarra.",
  },
];

const stats = [
  { k: "918k+", v: "licitações no radar" },
  { k: "R$ 2,3T", v: "em contratos mapeados" },
  { k: "5.500+", v: "órgãos com score" },
  { k: "D+1", v: "dados atualizados" },
];

const arquitetura = [
  { step: "01", title: "Coletamos", body: "Todos os dias buscamos automaticamente o que foi publicado no PNCP e no Portal da Transparência. Você não precisa fazer nada." },
  { step: "02", title: "Organizamos", body: "Cruzamos, deduplicamos e enriquecemos os dados com informações de vencedores, órgãos e histórico de contratos." },
  { step: "03", title: "Analisamos", body: "IA lê cada edital e devolve resumo, itens e ações recomendadas. Score de órgão calculado com metodologia auditável." },
  { step: "04", title: "Entregamos", body: "Dashboard, relatórios e alertas prontos. Sua equipe acessa em segundos o que levaria dias para consolidar manualmente." },
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
            maskImage: "radial-gradient(ellipse at 50% 0%, black 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full blur-[140px] opacity-30"
          style={{ background: `radial-gradient(circle, ${palette.accent} 0%, transparent 60%)` }}
        />
        <div
          className="absolute bottom-0 right-0 h-[500px] w-[500px] rounded-full blur-[160px] opacity-20"
          style={{ background: `radial-gradient(circle, ${palette.accentSoft} 0%, transparent 70%)` }}
        />
      </div>

      {/* NAV */}
      <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center">
          <img
            src={logoImg}
            alt="i-pesquisei"
            className="h-10 w-auto object-contain md:h-12"
          />
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          {[...nav, { label: "Planos", href: "#planos" }].map((n) => (
            <a key={n.href} href={n.href} className="text-sm text-slate-400 transition hover:text-slate-900">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Link to="/auth" className="hidden text-sm text-slate-600 hover:text-slate-900 sm:inline">
            Entrar
          </Link>
          <Link
            to="/auth"
            className="group inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white transition"
            style={{ background: palette.accent, boxShadow: `0 8px 30px ${palette.accent}55` }}
          >
            Acessar plataforma
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
        </div>
      </header>

      {/* HERO — split screen */}
      <section className="relative z-10 mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-6 pb-20 pt-16 lg:grid-cols-2 lg:pt-24">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-300 bg-indigo-100 px-3 py-1 text-xs text-indigo-600">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
            918 mil licitações · atualizadas todo dia
          </div>
          <h1 className="font-display mt-6 text-5xl font-semibold leading-[1.05] tracking-tight text-slate-900 sm:text-6xl lg:text-7xl">
            Ganhe mais licitações,{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: `linear-gradient(120deg, #0f172a 0%, ${palette.accent} 70%, #6366f1 100%)`,
              }}
            >
              gastando menos tempo procurando.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
            A plataforma B2G que reúne todo o mercado público brasileiro em um só lugar.
            Encontre editais, avalie órgãos, analise concorrentes e feche mais negócios com o
            governo — com dados oficiais e IA trabalhando pra você.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-white transition"
              style={{ background: palette.accent, boxShadow: `0 10px 40px ${palette.accent}66` }}
            >
              Começar teste grátis de 7 dias
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#planos"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 backdrop-blur transition hover:bg-slate-100"
            >
              Ver planos e preços
            </a>
          </div>

          <dl className="mt-12 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.v}>
                <dt className="font-display text-2xl font-semibold text-slate-900">{s.k}</dt>
                <dd className="mt-1 text-xs uppercase tracking-wider text-slate-400">{s.v}</dd>
              </div>
            ))}
          </dl>
        </motion.div>

        {/* Right — dashboard mock */}
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, ease: "easeOut", delay: 0.1 }}
          className="relative"
        >
          <div
            className="absolute -inset-6 rounded-3xl opacity-60 blur-2xl"
            style={{ background: `linear-gradient(140deg, ${palette.accent}, transparent 60%)` }}
          />
          <div
            className="relative overflow-hidden rounded-2xl border border-slate-200"
            style={{ background: `linear-gradient(160deg, ${palette.bg2} 0%, ${palette.bg} 100%)` }}
          >
            {/* window chrome */}
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
              <span className="ml-3 font-mono text-[11px] text-slate-400">
                ipesquisei.com.br / dashboard
              </span>
            </div>

            <div className="grid grid-cols-6 gap-3 p-5">
              {[
                { l: "Licitações", v: "918.4k", i: BarChart3 },
                { l: "PNCP", v: "742.1k", i: Database },
                { l: "Portal", v: "176.3k", i: Building2 },
              ].map((c) => (
                <div
                  key={c.l}
                  className="col-span-2 rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-wider text-slate-400">
                      {c.l}
                    </span>
                    <c.i className="h-3.5 w-3.5 text-indigo-600" />
                  </div>
                  <div className="font-display mt-2 text-2xl font-semibold text-slate-900">
                    {c.v}
                  </div>
                </div>
              ))}

              {/* chart */}
              <div className="col-span-6 rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wider text-slate-400">
                    Ingestão diária · últimos 30 dias
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                    healthy
                  </span>
                </div>
                <svg viewBox="0 0 600 120" className="h-28 w-full">
                  <defs>
                    <linearGradient id="ln" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor={palette.accent} stopOpacity="0.5" />
                      <stop offset="100%" stopColor={palette.accent} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {Array.from({ length: 30 }).map((_, i) => {
                    const h = 30 + Math.sin(i * 0.7) * 22 + (i % 4) * 6;
                    return (
                      <rect
                        key={i}
                        x={i * 20 + 4}
                        y={120 - h}
                        width="12"
                        height={h}
                        rx="3"
                        fill="url(#ln)"
                        stroke={palette.accent}
                        strokeOpacity="0.6"
                      />
                    );
                  })}
                </svg>
              </div>

              {/* rows */}
              <div className="col-span-6 space-y-2">
                {[
                  { o: "Ministério da Saúde", s: "AAA", v: "R$ 12,4M" },
                  { o: "Prefeitura de Salvador", s: "AA", v: "R$ 3,8M" },
                  { o: "TJ-SP", s: "A", v: "R$ 7,1M" },
                ].map((r) => (
                  <div
                    key={r.o}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <span className="text-slate-600">{r.o}</span>
                    <div className="flex items-center gap-3">
                      <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-600">
                        {r.s}
                      </span>
                      <span className="font-mono text-xs text-slate-400">{r.v}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* MÓDULOS */}
      <section id="plataforma" className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        <div className="mb-14 flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <span className="font-mono text-xs uppercase tracking-widest text-indigo-600">
              / o que você ganha
            </span>
            <h2 className="font-display mt-3 max-w-2xl text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">
              Tudo que sua equipe precisa para vender pro governo.
            </h2>
          </div>
          <p className="max-w-md text-sm text-slate-500">
            Enquanto seus concorrentes ainda perdem tempo em planilha, você já sabe qual
            edital vale disputar, quanto pedir e se o órgão paga em dia.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {modulos.map((m, i) => (
            <motion.div
              key={m.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-indigo-400 hover:bg-white/70"
            >
              <div
                className="absolute inset-x-0 top-0 h-px opacity-0 transition group-hover:opacity-100"
                style={{ background: `linear-gradient(90deg, transparent, ${palette.accent}, transparent)` }}
              />
              <div
                className="mb-5 grid h-11 w-11 place-items-center rounded-xl border border-indigo-300"
                style={{ background: `${palette.accent}22` }}
              >
                <m.icon className="h-5 w-5 text-indigo-600" />
              </div>
              <h3 className="font-display text-lg font-semibold text-slate-900">{m.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{m.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* DADOS + IA split */}
      <section id="dados" className="relative z-10 mx-auto grid max-w-7xl gap-6 px-6 py-16 lg:grid-cols-2">
        <div
          className="relative overflow-hidden rounded-2xl border border-slate-200 p-8"
          style={{ background: `linear-gradient(160deg, ${palette.bg2}, ${palette.bg})` }}
        >
          <span className="font-mono text-xs uppercase tracking-widest text-indigo-600">/ dados oficiais</span>
          <h3 className="font-display mt-3 text-3xl font-semibold text-slate-900">
            A mesma fonte que o governo usa — só que organizada.
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Trabalhamos com as bases oficiais do PNCP e do Portal da Transparência.
            Nada de dados de terceiros ou informação atrasada: você vê o que foi publicado
            ontem, hoje. Sem risco de perder prazo por falta de informação.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-slate-700">
            <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" /> Novas licitações no seu painel em até 24h</li>
            <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" /> Vencedores e valores homologados atualizados</li>
            <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" /> Histórico completo desde 2023</li>
            <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" /> Cobertura nacional: União, estados e municípios</li>
          </ul>
        </div>

        <div
          id="ia"
          className="relative overflow-hidden rounded-2xl border border-slate-200 p-8"
          style={{ background: `linear-gradient(160deg, ${palette.accentSoft}55, ${palette.bg})` }}
        >
          <span className="font-mono text-xs uppercase tracking-widest text-indigo-600">/ ia gemini</span>
          <h3 className="font-display mt-3 text-3xl font-semibold text-slate-900">
            Pare de ler edital de 80 páginas.
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Nossa IA lê o edital por você e devolve, em segundos, um resumo objetivo,
            a lista dos itens e três ações concretas para decidir se vale disputar.
            É como ter um analista dedicado em cada licitação.
          </p>
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-300">
            <div className="mb-2 text-indigo-400">↳ resumo</div>
            Pregão eletrônico para equipamentos hospitalares. Órgão com histórico
            regular de pagamentos. Concorrência moderada. Boa oportunidade.
            <div className="mt-3 text-indigo-400">↳ ações recomendadas</div>
            1. Confirmar habilitação técnica ANVISA<br />
            2. Simular margem sobre o valor de referência<br />
            3. Verificar o Score do órgão antes de propor
          </div>
        </div>
      </section>

      {/* SCORE */}
      <section id="score" className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div>
            <span className="font-mono text-xs uppercase tracking-widest text-indigo-600">
              / score do órgão
            </span>
            <h2 className="font-display mt-3 text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">
              Descubra se o órgão paga em dia — antes de propor.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-600">
              Cada órgão recebe uma nota de AAA a D com base em dados oficiais do Portal
              da Transparência, SICONFI e histórico de contratos. Você entra na disputa
              já sabendo se vale o esforço.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {["AAA", "AA", "A", "BBB", "BB", "B", "CCC", "CC", "C", "D"].map((s, i) => {
              const intensity = 1 - i / 12;
              return (
                <div
                  key={s}
                  className="grid aspect-square place-items-center rounded-xl border border-indigo-200 font-display text-lg font-semibold text-white"
                  style={{
                    background: `linear-gradient(140deg, rgba(79,70,229,${intensity * 0.55}), rgba(30,30,90,${intensity * 0.4}))`,
                  }}
                >
                  {s}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ARQUITETURA */}
      <section id="arquitetura" className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        <span className="font-mono text-xs uppercase tracking-widest text-indigo-600">
          / arquitetura
        </span>
        <h2 className="font-display mt-3 max-w-3xl text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">
          Da coleta à entrega, um pipeline observável.
        </h2>
        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {arquitetura.map((a) => (
            <div
              key={a.step}
              className="relative rounded-2xl border border-slate-200 bg-white p-6"
            >
              <div className="font-mono text-xs text-indigo-600">{a.step}</div>
              <h4 className="font-display mt-2 text-xl font-semibold text-slate-900">
                {a.title}
              </h4>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{a.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PLANOS */}
      <section id="planos" className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        <div className="mb-14 flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <span className="font-mono text-xs uppercase tracking-widest text-indigo-600">
              / planos
            </span>
            <h2 className="font-display mt-3 max-w-2xl text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">
              Escolha o plano e comece hoje.
            </h2>
          </div>
          <p className="max-w-md text-sm text-slate-500">
            Todos os planos incluem acesso ao pipeline PNCP + Portal da Transparência,
            RLS multi-tenant e atualização diária.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {[
            {
              name: "Starter",
              price: "R$ 490",
              period: "/mês",
              desc: "Para times pequenos validando o mercado público.",
              features: [
                "1 empresa (tenant)",
                "Até 3 usuários",
                "Consulta ilimitada às 918k+ licitações",
                "Score de órgãos AAA–D",
                "Exportação CSV até 10k linhas",
              ],
              cta: "Começar agora",
              highlight: false,
            },
            {
              name: "Growth",
              price: "R$ 1.490",
              period: "/mês",
              desc: "Operação recorrente com análise IA por licitação.",
              features: [
                "Até 10 usuários",
                "Análise IA Gemini incluída",
                "Relatórios dinâmicos + API keys",
                "Ingestão on-demand por CNPJ de órgão",
                "Suporte prioritário",
              ],
              cta: "Assinar Growth",
              highlight: true,
            },
            {
              name: "Enterprise",
              price: "Sob consulta",
              period: "",
              desc: "Volume alto, integrações e SLA dedicado.",
              features: [
                "Usuários ilimitados",
                "SLA e ambiente dedicado",
                "Integração via API + webhooks",
                "Onboarding e treinamento",
                "Dados históricos completos",
              ],
              cta: "Falar com vendas",
              highlight: false,
            },
          ].map((p) => (
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
                  Mais escolhido
                </span>
              )}
              <div className="font-display text-lg font-semibold text-slate-900">{p.name}</div>
              <p className="mt-2 text-sm text-slate-500">{p.desc}</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="font-display text-4xl font-semibold text-slate-900">
                  {p.price}
                </span>
                <span className="text-sm text-slate-500">{p.period}</span>
              </div>
              <ul className="mt-6 space-y-3 text-sm text-slate-700">
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

        <p className="mt-8 text-center text-xs text-slate-400">
          7 dias de teste em qualquer plano · cancele quando quiser · pagamento em BRL
        </p>
      </section>

      {/* CTA */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-24">
        <div
          className="relative overflow-hidden rounded-3xl border border-indigo-300 p-12 text-center"
          style={{
            background: `linear-gradient(140deg, ${palette.accentSoft}, ${palette.bg2})`,
            boxShadow: `0 40px 120px -20px ${palette.accent}55`,
          }}
        >
          <Sparkles className="mx-auto h-8 w-8 text-indigo-600" />
          <h2 className="font-display mt-6 text-4xl font-semibold text-slate-900 sm:text-5xl">
            Comece hoje. Cancele quando quiser.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm text-slate-600">
            7 dias de teste gratuito em qualquer plano. Ative sua empresa em menos de 2
            minutos e comece a operar sobre 918k+ licitações no primeiro login.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-white transition"
              style={{ background: palette.accent, boxShadow: `0 12px 40px ${palette.accent}66` }}
            >
              Começar teste grátis
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#planos"
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/70 px-6 py-3 text-sm font-medium text-slate-700 backdrop-blur transition hover:bg-slate-100"
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
            <Activity className="h-4 w-4 text-indigo-600" />
            <span className="font-mono text-xs text-slate-400">
              i-pesquisei · inteligência B2G · dados de fontes públicas oficiais
            </span>
          </div>
          <div className="flex items-center gap-6 text-xs text-slate-400">
            <a href="#plataforma" className="hover:text-slate-900">Plataforma</a>
            <a href="#arquitetura" className="hover:text-slate-900">Arquitetura</a>
            <Link to="/auth" className="hover:text-slate-900">Entrar</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
