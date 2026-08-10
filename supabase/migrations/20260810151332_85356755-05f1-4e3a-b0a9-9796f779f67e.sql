CREATE OR REPLACE FUNCTION public.gap_queue_top_orgaos(p_limit integer DEFAULT 10)
RETURNS TABLE(cnpj text, ano integer, gaps bigint, max_seq integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '30s'
AS $$
  SELECT q.cnpj, q.ano, count(*)::bigint AS gaps, max(q.seq)::int AS max_seq
  FROM public.pncp_gap_queue q
  WHERE q.status IN ('pending', 'processing')
  GROUP BY q.cnpj, q.ano
  ORDER BY count(*) DESC
  LIMIT GREATEST(1, LEAST(p_limit, 50));
$$;

REVOKE ALL ON FUNCTION public.gap_queue_top_orgaos(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.gap_queue_top_orgaos(integer) TO authenticated, service_role;