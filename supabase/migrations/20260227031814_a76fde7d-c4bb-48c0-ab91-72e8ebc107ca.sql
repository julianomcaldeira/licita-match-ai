
-- Vendas mensais no período
CREATE OR REPLACE FUNCTION public.analytics_monthly_sales(
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL
)
RETURNS TABLE (
  month TEXT,
  total_valor NUMERIC,
  contract_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    TO_CHAR(lv.created_at, 'YYYY-MM') AS month,
    COALESCE(SUM(lv.valor_final), 0) AS total_valor,
    COUNT(*)::BIGINT AS contract_count
  FROM licitacao_vencedores lv
  WHERE (p_date_from IS NULL OR lv.created_at >= p_date_from::timestamptz)
    AND (p_date_to IS NULL OR lv.created_at < (p_date_to + 1)::timestamptz)
  GROUP BY TO_CHAR(lv.created_at, 'YYYY-MM')
  ORDER BY month;
$$;

-- Totais de vendas no período
CREATE OR REPLACE FUNCTION public.analytics_sales_totals(
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL
)
RETURNS TABLE (
  total_sales NUMERIC,
  total_contracts BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    COALESCE(SUM(lv.valor_final), 0) AS total_sales,
    COUNT(*)::BIGINT AS total_contracts
  FROM licitacao_vencedores lv
  WHERE (p_date_from IS NULL OR lv.created_at >= p_date_from::timestamptz)
    AND (p_date_to IS NULL OR lv.created_at < (p_date_to + 1)::timestamptz);
$$;
