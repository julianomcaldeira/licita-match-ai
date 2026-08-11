DROP FUNCTION IF EXISTS public.requeue_stalled_gaps(integer, integer);

CREATE OR REPLACE FUNCTION public.requeue_stalled_gaps(
  p_stale_minutes integer DEFAULT 8,
  p_limit integer DEFAULT 200000
)
RETURNS TABLE(requeued_processing bigint, requeued_failed bigint, closed_terminal bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a bigint := 0;
  b bigint := 0;
  c bigint := 0;
BEGIN
  -- 1) devolve itens travados em processing
  WITH stale AS (
    SELECT cnpj, ano, seq FROM public.pncp_gap_queue
    WHERE status = 'processing'
      AND coalesce(claimed_at, now() - interval '999 days') < now() - make_interval(mins => greatest(1, p_stale_minutes))
    LIMIT greatest(1, p_limit)
    FOR UPDATE SKIP LOCKED
  ), u AS (
    UPDATE public.pncp_gap_queue q
    SET status = 'pending', claimed_at = NULL, updated_at = now()
    FROM stale s
    WHERE q.cnpj = s.cnpj AND q.ano = s.ano AND q.seq = s.seq
    RETURNING 1
  )
  SELECT count(*) INTO a FROM u;

  -- 2) devolve falhas transitórias com tentativas restantes
  WITH bad AS (
    SELECT cnpj, ano, seq FROM public.pncp_gap_queue
    WHERE status = 'failed'
      AND attempts < 8
      AND public.gap_classify_status('error', last_error) = 'retry'
      AND updated_at < now() - interval '30 minutes'
    LIMIT greatest(1, p_limit)
    FOR UPDATE SKIP LOCKED
  ), u2 AS (
    UPDATE public.pncp_gap_queue q
    SET status = 'pending', claimed_at = NULL, updated_at = now()
    FROM bad s
    WHERE q.cnpj = s.cnpj AND q.ano = s.ano AND q.seq = s.seq
    RETURNING 1
  )
  SELECT count(*) INTO b FROM u2;

  -- 3) fecha erros definitivos que voltaram para a fila (404/410/etc)
  WITH term AS (
    SELECT cnpj, ano, seq FROM public.pncp_gap_queue
    WHERE status IN ('pending', 'processing', 'failed')
      AND last_error IS NOT NULL
      AND public.gap_classify_status('error', last_error) = 'not_found'
    LIMIT greatest(1, p_limit)
    FOR UPDATE SKIP LOCKED
  ), u3 AS (
    UPDATE public.pncp_gap_queue q
    SET status = 'not_found', claimed_at = NULL, updated_at = now()
    FROM term s
    WHERE q.cnpj = s.cnpj AND q.ano = s.ano AND q.seq = s.seq
    RETURNING 1
  )
  SELECT count(*) INTO c FROM u3;

  requeued_processing := a;
  requeued_failed := b;
  closed_terminal := c;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.requeue_stalled_gaps(integer, integer) FROM PUBLIC, anon, authenticated;