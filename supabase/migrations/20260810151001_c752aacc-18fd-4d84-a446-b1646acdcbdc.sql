CREATE TABLE IF NOT EXISTS public.pncp_gap_queue (
  cnpj text NOT NULL,
  ano integer NOT NULL,
  seq integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cnpj, ano, seq)
);

GRANT SELECT ON public.pncp_gap_queue TO authenticated;
GRANT ALL ON public.pncp_gap_queue TO service_role;

ALTER TABLE public.pncp_gap_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_central reads gap queue" ON public.pncp_gap_queue;
CREATE POLICY "admin_central reads gap queue"
ON public.pncp_gap_queue FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin_central'));

CREATE INDEX IF NOT EXISTS idx_gap_queue_pending
  ON public.pncp_gap_queue (status, ano DESC, cnpj, seq);
CREATE INDEX IF NOT EXISTS idx_gap_queue_claimed
  ON public.pncp_gap_queue (claimed_at) WHERE status = 'processing';

DROP TRIGGER IF EXISTS trg_gap_queue_updated_at ON public.pncp_gap_queue;
CREATE TRIGGER trg_gap_queue_updated_at
BEFORE UPDATE ON public.pncp_gap_queue
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Recalcula a fila (roda no cron, fora do caminho crítico da ingestão)
CREATE OR REPLACE FUNCTION public.refresh_pncp_gap_queue(p_min_ano integer DEFAULT 2023)
RETURNS TABLE(inserted bigint, cleaned bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '900s'
AS $$
DECLARE
  v_ins bigint := 0;
  v_del bigint := 0;
BEGIN
  CREATE TEMP TABLE _parsed ON COMMIT DROP AS
  SELECT
    substring(l.numero_controle_pncp FROM '^(\d{14})') AS cnpj,
    substring(l.numero_controle_pncp FROM '/(\d{4})$')::int AS ano,
    substring(l.numero_controle_pncp FROM '-(\d+)/\d{4}$')::int AS seq
  FROM public.licitacoes l
  WHERE l.fonte = 'PNCP'
    AND l.numero_controle_pncp ~ '^\d{14}-\d+-\d+/\d{4}$';

  DELETE FROM _parsed
  WHERE ano < p_min_ano OR ano > EXTRACT(YEAR FROM now())::int;

  CREATE INDEX ON _parsed (cnpj, ano, seq);
  ANALYZE _parsed;

  WITH bounds AS (
    SELECT cnpj, ano, MAX(seq) AS max_seq
    FROM _parsed
    GROUP BY cnpj, ano
    HAVING MAX(seq) <= 3000 AND COUNT(*) >= 3
  ),
  expected AS (
    SELECT b.cnpj, b.ano, gs.seq
    FROM bounds b
    JOIN LATERAL generate_series(1, b.max_seq) AS gs(seq) ON true
  ),
  missing AS (
    SELECT e.cnpj, e.ano, e.seq
    FROM expected e
    LEFT JOIN _parsed p
      ON p.cnpj = e.cnpj AND p.ano = e.ano AND p.seq = e.seq
    WHERE p.seq IS NULL
  ),
  ins AS (
    INSERT INTO public.pncp_gap_queue (cnpj, ano, seq)
    SELECT cnpj, ano, seq FROM missing
    ON CONFLICT (cnpj, ano, seq) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_ins FROM ins;

  WITH del AS (
    DELETE FROM public.pncp_gap_queue q
    USING _parsed p
    WHERE p.cnpj = q.cnpj AND p.ano = q.ano AND p.seq = q.seq
    RETURNING 1
  )
  SELECT count(*) INTO v_del FROM del;

  RETURN QUERY SELECT v_ins, v_del;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_pncp_gap_queue(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_pncp_gap_queue(integer) TO service_role;

-- Reserva um lote atomicamente (rápido, usa índice)
CREATE OR REPLACE FUNCTION public.claim_gap_batch(p_limit integer DEFAULT 200)
RETURNS TABLE(cnpj text, ano integer, seq integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '30s'
AS $$
  WITH picked AS (
    SELECT q.cnpj, q.ano, q.seq
    FROM public.pncp_gap_queue q
    WHERE q.status = 'pending'
       OR (q.status = 'processing' AND q.claimed_at < now() - interval '15 minutes')
    ORDER BY q.ano DESC, q.attempts, q.cnpj, q.seq
    LIMIT GREATEST(1, LEAST(p_limit, 3000))
    FOR UPDATE SKIP LOCKED
  ),
  upd AS (
    UPDATE public.pncp_gap_queue q
    SET status = 'processing', claimed_at = now(), attempts = q.attempts + 1
    FROM picked p
    WHERE q.cnpj = p.cnpj AND q.ano = p.ano AND q.seq = p.seq
    RETURNING q.cnpj, q.ano, q.seq
  )
  SELECT * FROM upd;
$$;

REVOKE ALL ON FUNCTION public.claim_gap_batch(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_gap_batch(integer) TO service_role;

-- Registra o desfecho de cada item
CREATE OR REPLACE FUNCTION public.mark_gap_result(
  p_cnpj text, p_ano integer, p_seq integer, p_status text, p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_status = 'done' THEN
    DELETE FROM public.pncp_gap_queue
    WHERE cnpj = p_cnpj AND ano = p_ano AND seq = p_seq;
  ELSE
    UPDATE public.pncp_gap_queue
    SET status = CASE
          WHEN p_status = 'not_found' THEN 'not_found'
          WHEN attempts >= 5 THEN 'failed'
          ELSE 'pending' END,
        last_error = p_error,
        claimed_at = NULL
    WHERE cnpj = p_cnpj AND ano = p_ano AND seq = p_seq;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_gap_result(text, integer, integer, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_gap_result(text, integer, integer, text, text) TO service_role;

-- Resumo rápido para o painel
CREATE OR REPLACE FUNCTION public.gap_queue_summary()
RETURNS TABLE(pending bigint, processing bigint, not_found bigint, failed bigint, orgaos bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '30s'
AS $$
  SELECT
    count(*) FILTER (WHERE status = 'pending'),
    count(*) FILTER (WHERE status = 'processing'),
    count(*) FILTER (WHERE status = 'not_found'),
    count(*) FILTER (WHERE status = 'failed'),
    count(DISTINCT cnpj)
  FROM public.pncp_gap_queue;
$$;

REVOKE ALL ON FUNCTION public.gap_queue_summary() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.gap_queue_summary() TO authenticated, service_role;