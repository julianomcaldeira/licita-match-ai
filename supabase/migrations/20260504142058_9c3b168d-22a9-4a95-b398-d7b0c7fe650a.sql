-- Tabela de score de bom pagador por órgão
CREATE TABLE IF NOT EXISTS public.orgaos_score (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj_orgao text NOT NULL UNIQUE,
  nome_orgao text NOT NULL,
  uf text,
  
  -- Métricas Portal da Transparência (pagamentos)
  total_empenhado numeric DEFAULT 0,
  total_liquidado numeric DEFAULT 0,
  total_pago numeric DEFAULT 0,
  qtd_pagamentos integer DEFAULT 0,
  pct_pago_sobre_empenhado numeric DEFAULT 0,
  
  -- Métricas SICONFI (saúde fiscal)
  receita_corrente_liquida numeric,
  divida_consolidada_liquida numeric,
  pct_divida_rcl numeric,
  
  -- Métricas internas (contratos da plataforma)
  qtd_contratos_analisados integer DEFAULT 0,
  atraso_medio_dias numeric DEFAULT 0,
  pct_contratos_em_dia numeric DEFAULT 0,
  
  -- Score final
  score_numerico integer NOT NULL DEFAULT 0 CHECK (score_numerico >= 0 AND score_numerico <= 1000),
  score_classificacao text NOT NULL DEFAULT 'D' CHECK (score_classificacao IN ('AAA','AA','A','BBB','BB','B','CCC','CC','C','D','SD')),
  
  -- Componentes do score (transparência)
  score_pagamento integer DEFAULT 0,
  score_fiscal integer DEFAULT 0,
  score_execucao integer DEFAULT 0,
  
  fontes_utilizadas text[] DEFAULT ARRAY[]::text[],
  observacoes text,
  
  ano_referencia integer NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::integer,
  calculado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orgaos_score_cnpj ON public.orgaos_score(cnpj_orgao);
CREATE INDEX IF NOT EXISTS idx_orgaos_score_score ON public.orgaos_score(score_numerico DESC);
CREATE INDEX IF NOT EXISTS idx_orgaos_score_classificacao ON public.orgaos_score(score_classificacao);
CREATE INDEX IF NOT EXISTS idx_orgaos_score_uf ON public.orgaos_score(uf);

ALTER TABLE public.orgaos_score ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read orgaos_score"
  ON public.orgaos_score FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role manages orgaos_score"
  ON public.orgaos_score FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_orgaos_score_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orgaos_score_updated_at ON public.orgaos_score;
CREATE TRIGGER trg_orgaos_score_updated_at
  BEFORE UPDATE ON public.orgaos_score
  FOR EACH ROW EXECUTE FUNCTION public.update_orgaos_score_updated_at();

-- RPC para consulta rápida por CNPJ (usado pela UI)
CREATE OR REPLACE FUNCTION public.get_orgao_score(p_cnpj text)
RETURNS TABLE (
  cnpj_orgao text,
  nome_orgao text,
  uf text,
  score_numerico integer,
  score_classificacao text,
  score_pagamento integer,
  score_fiscal integer,
  score_execucao integer,
  pct_pago_sobre_empenhado numeric,
  pct_divida_rcl numeric,
  pct_contratos_em_dia numeric,
  atraso_medio_dias numeric,
  qtd_contratos_analisados integer,
  fontes_utilizadas text[],
  calculado_em timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cnpj_orgao, nome_orgao, uf,
    score_numerico, score_classificacao,
    score_pagamento, score_fiscal, score_execucao,
    pct_pago_sobre_empenhado, pct_divida_rcl,
    pct_contratos_em_dia, atraso_medio_dias,
    qtd_contratos_analisados, fontes_utilizadas,
    calculado_em
  FROM public.orgaos_score
  WHERE cnpj_orgao = regexp_replace(p_cnpj, '\D', '', 'g')
  LIMIT 1;
$$;

-- RPC para listar top órgãos por score (ranking)
CREATE OR REPLACE FUNCTION public.list_top_orgaos_score(
  p_uf text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  cnpj_orgao text,
  nome_orgao text,
  uf text,
  score_numerico integer,
  score_classificacao text,
  qtd_contratos_analisados integer,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT * FROM public.orgaos_score
    WHERE (p_uf IS NULL OR uf = p_uf)
      AND score_classificacao <> 'SD'
  )
  SELECT
    cnpj_orgao, nome_orgao, uf,
    score_numerico, score_classificacao,
    qtd_contratos_analisados,
    (SELECT COUNT(*) FROM base) AS total_count
  FROM base
  ORDER BY score_numerico DESC
  LIMIT p_limit OFFSET p_offset;
$$;