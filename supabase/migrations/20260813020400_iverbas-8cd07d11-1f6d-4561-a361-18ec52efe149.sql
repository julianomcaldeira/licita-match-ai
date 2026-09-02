
-- ═══════════════════════════════════════════════════════════════
-- MARKET INSIGHTS — Strategic intelligence alerts
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.market_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_insight TEXT NOT NULL, -- 'aceleracao_empenho', 'concentracao_fornecedor', 'crescimento_anormal', 'desaceleracao'
  descricao TEXT NOT NULL,
  orgao TEXT,
  fornecedor TEXT,
  cnpj_fornecedor TEXT,
  data_referencia DATE NOT NULL DEFAULT CURRENT_DATE,
  relevancia_score NUMERIC NOT NULL DEFAULT 0, -- 0-100
  dados_json JSONB, -- arbitrary supporting data
  periodo TEXT, -- '2025-01', '2025-Q1', etc
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.market_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read insights"
  ON public.market_insights FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX idx_market_insights_tipo ON public.market_insights(tipo_insight);
CREATE INDEX idx_market_insights_orgao ON public.market_insights(orgao);
CREATE INDEX idx_market_insights_data ON public.market_insights(data_referencia);
CREATE INDEX idx_market_insights_relevancia ON public.market_insights(relevancia_score DESC);

-- ═══════════════════════════════════════════════════════════════
-- ISCORES — Proprietary intelligence scores
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.iscores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_tipo TEXT NOT NULL CHECK (entidade_tipo IN ('orgao', 'fornecedor')),
  entidade_nome TEXT NOT NULL,
  entidade_id TEXT, -- CNPJ or organ code
  tipo_score TEXT NOT NULL, -- 'oportunidade', 'dominio_mercado', 'dependencia_publica'
  valor NUMERIC NOT NULL DEFAULT 0, -- 0-100
  componentes JSONB, -- breakdown of score components
  periodo TEXT NOT NULL, -- '2025', '2025-01'
  ano INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.iscores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read iscores"
  ON public.iscores FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX idx_iscores_entidade ON public.iscores(entidade_tipo, entidade_nome);
CREATE INDEX idx_iscores_tipo ON public.iscores(tipo_score);
CREATE INDEX idx_iscores_periodo ON public.iscores(periodo);
CREATE UNIQUE INDEX idx_iscores_unique ON public.iscores(entidade_tipo, entidade_nome, tipo_score, periodo);

-- ═══════════════════════════════════════════════════════════════
-- SECTOR BENCHMARK — Anonymized sector comparisons
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.sector_benchmark (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segmento TEXT NOT NULL,
  total_pago NUMERIC NOT NULL DEFAULT 0,
  total_empenhado NUMERIC NOT NULL DEFAULT 0,
  crescimento_medio NUMERIC DEFAULT 0, -- percentage
  num_fornecedores INTEGER DEFAULT 0,
  hhi_index NUMERIC DEFAULT 0, -- Herfindahl-Hirschman Index
  top5_pct NUMERIC DEFAULT 0,
  periodo TEXT NOT NULL,
  ano INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sector_benchmark ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read benchmarks"
  ON public.sector_benchmark FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX idx_benchmark_segmento ON public.sector_benchmark(segmento);
CREATE INDEX idx_benchmark_periodo ON public.sector_benchmark(periodo, ano);

-- ═══════════════════════════════════════════════════════════════
-- EXECUTIVE REPORTS — Monthly automated reports
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.executive_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mes_referencia TEXT NOT NULL, -- '2025-01'
  ano INTEGER NOT NULL,
  resumo_gerado TEXT,
  dados_json JSONB, -- full report data
  arquivo_url TEXT, -- future PDF link
  status TEXT NOT NULL DEFAULT 'gerado',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.executive_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read reports"
  ON public.executive_reports FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX idx_reports_mes ON public.executive_reports(mes_referencia);
CREATE INDEX idx_reports_ano ON public.executive_reports(ano);

-- ═══════════════════════════════════════════════════════════════
-- CONCENTRATION ANALYSIS — HHI by organ (monthly)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.concentration_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orgao TEXT NOT NULL,
  hhi_index NUMERIC NOT NULL DEFAULT 0,
  top3_pct NUMERIC DEFAULT 0,
  top5_pct NUMERIC DEFAULT 0,
  top10_pct NUMERIC DEFAULT 0,
  total_fornecedores INTEGER DEFAULT 0,
  total_pago NUMERIC DEFAULT 0,
  periodo TEXT NOT NULL,
  ano INTEGER NOT NULL,
  classificacao TEXT, -- 'competitivo', 'moderado', 'concentrado', 'altamente_concentrado'
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.concentration_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read concentration"
  ON public.concentration_analysis FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX idx_concentration_orgao ON public.concentration_analysis(orgao);
CREATE INDEX idx_concentration_periodo ON public.concentration_analysis(periodo, ano);
