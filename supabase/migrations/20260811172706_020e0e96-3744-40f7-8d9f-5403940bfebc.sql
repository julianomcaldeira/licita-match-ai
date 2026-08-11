
-- 1) Classificação de falhas
CREATE OR REPLACE FUNCTION public.gap_classify_status(p_status text, p_error text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_status = 'done' THEN 'done'
    WHEN p_status = 'not_found' THEN 'not_found'
    WHEN coalesce(p_error,'') ~* '(http_404|http_410|not_found|compra_missing_numero)' THEN 'not_found'
    ELSE 'retry'
  END;
$$;

CREATE OR REPLACE FUNCTION public.mark_gap_result(p_cnpj text, p_ano integer, p_seq integer, p_status text, p_error text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_class text := public.gap_classify_status(p_status, p_error);
BEGIN
  IF v_class = 'done' THEN
    DELETE FROM public.pncp_gap_queue
    WHERE cnpj = p_cnpj AND ano = p_ano AND seq = p_seq;
  ELSIF v_class = 'not_found' THEN
    UPDATE public.pncp_gap_queue
    SET status = 'not_found', last_error = p_error, claimed_at = NULL, updated_at = now()
    WHERE cnpj = p_cnpj AND ano = p_ano AND seq = p_seq;
  ELSE
    UPDATE public.pncp_gap_queue
    SET status = CASE WHEN attempts >= 8 THEN 'failed' ELSE 'pending' END,
        last_error = coalesce(p_error, 'erro_desconhecido'),
        claimed_at = NULL,
        updated_at = now()
    WHERE cnpj = p_cnpj AND ano = p_ano AND seq = p_seq;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_gap_results(p_results jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  n int := 0;
BEGIN
  WITH r AS (
    SELECT (e->>'cnpj')::text AS cnpj,
           (e->>'ano')::int   AS ano,
           (e->>'seq')::int   AS seq,
           (e->>'status')::text AS status,
           (e->>'error')::text  AS err,
           public.gap_classify_status(e->>'status', e->>'error') AS klass
    FROM jsonb_array_elements(coalesce(p_results,'[]'::jsonb)) e
  ),
  del AS (
    DELETE FROM public.pncp_gap_queue q
    USING r
    WHERE r.klass = 'done'
      AND q.cnpj = r.cnpj AND q.ano = r.ano AND q.seq = r.seq
    RETURNING 1
  ),
  upd AS (
    UPDATE public.pncp_gap_queue q
    SET status = CASE
          WHEN r.klass = 'not_found' THEN 'not_found'
          WHEN q.attempts >= 8 THEN 'failed'
          ELSE 'pending' END,
        last_error = coalesce(r.err, 'erro_desconhecido'),
        claimed_at = NULL,
        updated_at = now()
    FROM r
    WHERE r.klass <> 'done'
      AND q.cnpj = r.cnpj AND q.ano = r.ano AND q.seq = r.seq
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM del) + (SELECT count(*) FROM upd) INTO n;
  RETURN n;
END;
$function$;

-- 2) Requeue automático
CREATE OR REPLACE FUNCTION public.requeue_stalled_gaps(
  p_stale_minutes integer DEFAULT 15,
  p_limit integer DEFAULT 200000
)
RETURNS TABLE(requeued_processing bigint, requeued_failed bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout TO '120s'
AS $function$
DECLARE
  a bigint := 0;
  b bigint := 0;
BEGIN
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

  requeued_processing := a;
  requeued_failed := b;
  RETURN NEXT;
END;
$function$;

-- 3) Reclassifica falhas definitivas já acumuladas (410 = removido no PNCP)
UPDATE public.pncp_gap_queue
SET status = 'not_found', claimed_at = NULL, updated_at = now()
WHERE status = 'failed'
  AND public.gap_classify_status('error', last_error) = 'not_found';

-- 4) Destrava o backlog atual
UPDATE public.pncp_gap_queue
SET status = 'pending', claimed_at = NULL, updated_at = now()
WHERE status = 'processing'
  AND coalesce(claimed_at, now() - interval '999 days') < now() - interval '15 minutes';

UPDATE public.pncp_gap_queue
SET status = 'pending', attempts = least(attempts, 5), claimed_at = NULL, updated_at = now()
WHERE status = 'failed';

-- 5) Cron a cada 10 minutos
SELECT cron.unschedule('requeue-stalled-gaps')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'requeue-stalled-gaps');

SELECT cron.schedule(
  'requeue-stalled-gaps',
  '*/10 * * * *',
  $$SELECT public.requeue_stalled_gaps(15, 200000);$$
);
