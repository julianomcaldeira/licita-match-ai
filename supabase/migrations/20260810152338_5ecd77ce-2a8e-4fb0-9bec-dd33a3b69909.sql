
CREATE OR REPLACE FUNCTION public.mark_gap_results(p_results jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int := 0;
BEGIN
  WITH r AS (
    SELECT (e->>'cnpj')::text AS cnpj,
           (e->>'ano')::int AS ano,
           (e->>'seq')::int AS seq,
           (e->>'status')::text AS status,
           (e->>'error')::text AS err
    FROM jsonb_array_elements(COALESCE(p_results, '[]'::jsonb)) e
  ),
  del AS (
    DELETE FROM public.pncp_gap_queue q
    USING r
    WHERE q.cnpj = r.cnpj AND q.ano = r.ano AND q.seq = r.seq
      AND r.status = 'done'
    RETURNING 1
  ),
  upd AS (
    UPDATE public.pncp_gap_queue q
    SET status = CASE
          WHEN r.status = 'not_found' THEN 'not_found'
          WHEN q.attempts >= 5 THEN 'failed'
          ELSE 'pending' END,
        last_error = r.err,
        claimed_at = NULL,
        updated_at = now()
    FROM r
    WHERE q.cnpj = r.cnpj AND q.ano = r.ano AND q.seq = r.seq
      AND r.status <> 'done'
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM del) + (SELECT count(*) FROM upd) INTO n;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_gap_results(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_gap_results(jsonb) TO service_role;

UPDATE public.cron_autoscale_state
SET limit_per_run = 1500,
    parallelism = 16,
    min_limit = 400,
    max_limit = 4000,
    min_parallel = 6,
    max_parallel = 32,
    budget_ms = 110000,
    updated_at = now()
WHERE target = 'gaps';
