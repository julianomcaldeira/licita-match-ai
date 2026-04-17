-- RPC: total de contratos ingeridos por dia (últimos 30 dias)
CREATE OR REPLACE FUNCTION public.contratos_por_dia(p_days integer DEFAULT 30)
RETURNS TABLE(dia date, total bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '15s'
AS $$
  SELECT created_at::date AS dia, COUNT(*)::bigint AS total
  FROM contratos
  WHERE created_at >= now() - (p_days || ' days')::interval
  GROUP BY created_at::date
  ORDER BY dia DESC;
$$;

-- RPC: top órgãos por número de contratos (últimos N dias)
CREATE OR REPLACE FUNCTION public.contratos_top_orgaos(p_days integer DEFAULT 30, p_limit integer DEFAULT 10)
RETURNS TABLE(orgao_nome text, cnpj_orgao text, total bigint, valor_total numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '15s'
AS $$
  SELECT
    COALESCE(orgao_nome, '—') AS orgao_nome,
    cnpj_orgao,
    COUNT(*)::bigint AS total,
    COALESCE(SUM(valor_inicial), 0) AS valor_total
  FROM contratos
  WHERE created_at >= now() - (p_days || ' days')::interval
  GROUP BY orgao_nome, cnpj_orgao
  ORDER BY total DESC
  LIMIT p_limit;
$$;

-- Total de contratos
CREATE OR REPLACE FUNCTION public.contratos_stats()
RETURNS TABLE(total bigint, total_30d bigint, total_7d bigint, total_hoje bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '15s'
AS $$
  SELECT
    (SELECT COUNT(*)::bigint FROM contratos) AS total,
    (SELECT COUNT(*)::bigint FROM contratos WHERE created_at >= now() - interval '30 days') AS total_30d,
    (SELECT COUNT(*)::bigint FROM contratos WHERE created_at >= now() - interval '7 days') AS total_7d,
    (SELECT COUNT(*)::bigint FROM contratos WHERE created_at::date = current_date) AS total_hoje;
$$;