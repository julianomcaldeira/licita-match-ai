SET statement_timeout = '120s';
SET lock_timeout = '20s';

CREATE TABLE IF NOT EXISTS public.itens_backfill_queue (
  licitacao_id uuid PRIMARY KEY,
  numero_controle_pncp text NOT NULL,
  data_publicacao date,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.itens_backfill_queue TO authenticated;
GRANT ALL ON public.itens_backfill_queue TO service_role;
ALTER TABLE public.itens_backfill_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin central le fila de itens" ON public.itens_backfill_queue;
CREATE POLICY "admin central le fila de itens"
  ON public.itens_backfill_queue FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin_central'));

CREATE INDEX IF NOT EXISTS idx_itens_queue_pending
  ON public.itens_backfill_queue (data_publicacao DESC NULLS LAST)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.itens_queue_seed_state (
  id text PRIMARY KEY DEFAULT 'default',
  last_id uuid,
  done boolean NOT NULL DEFAULT false,
  scanned bigint NOT NULL DEFAULT 0,
  enqueued bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.itens_queue_seed_state TO authenticated;
GRANT ALL ON public.itens_queue_seed_state TO service_role;
ALTER TABLE public.itens_queue_seed_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin central le seed state" ON public.itens_queue_seed_state;
CREATE POLICY "admin central le seed state"
  ON public.itens_queue_seed_state FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin_central'));
INSERT INTO public.itens_queue_seed_state(id) VALUES ('default') ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_itens_backfill_queue(p_batch integer DEFAULT 50000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_last uuid;
  v_done boolean;
  v_max uuid;
  v_scanned int := 0;
  v_enq int := 0;
BEGIN
  SELECT last_id, done INTO v_last, v_done FROM public.itens_queue_seed_state WHERE id = 'default' FOR UPDATE;
  IF v_done THEN
    RETURN jsonb_build_object('done', true, 'scanned', 0, 'enqueued', 0);
  END IF;

  WITH janela AS (
    SELECT l.id, l.numero_controle_pncp, l.data_publicacao
      FROM public.licitacoes l
     WHERE (v_last IS NULL OR l.id > v_last)
     ORDER BY l.id
     LIMIT GREATEST(1000, LEAST(p_batch, 200000))
  ), ins AS (
    INSERT INTO public.itens_backfill_queue (licitacao_id, numero_controle_pncp, data_publicacao)
    SELECT j.id, j.numero_controle_pncp, j.data_publicacao
      FROM janela j
     WHERE j.numero_controle_pncp ~ '^\d{14}-\d+-\d+/\d{4}$'
       AND NOT EXISTS (SELECT 1 FROM public.licitacao_itens li WHERE li.licitacao_id = j.id)
    ON CONFLICT (licitacao_id) DO NOTHING
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM janela), (SELECT count(*) FROM ins), (SELECT max(id) FROM janela)
    INTO v_scanned, v_enq, v_max;

  UPDATE public.itens_queue_seed_state
     SET last_id = COALESCE(v_max, last_id),
         done = (v_scanned = 0),
         scanned = scanned + v_scanned,
         enqueued = enqueued + v_enq,
         updated_at = now()
   WHERE id = 'default';

  RETURN jsonb_build_object('done', v_scanned = 0, 'scanned', v_scanned, 'enqueued', v_enq);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.refill_itens_backfill_queue(p_since interval DEFAULT interval '2 days')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_n integer;
BEGIN
  INSERT INTO public.itens_backfill_queue (licitacao_id, numero_controle_pncp, data_publicacao)
  SELECT l.id, l.numero_controle_pncp, l.data_publicacao
    FROM public.licitacoes l
   WHERE l.fonte = 'PNCP'
     AND l.created_at > now() - p_since
     AND l.numero_controle_pncp ~ '^\d{14}-\d+-\d+/\d{4}$'
     AND NOT EXISTS (SELECT 1 FROM public.licitacao_itens li WHERE li.licitacao_id = l.id)
  ON CONFLICT (licitacao_id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$fn$;

DROP FUNCTION IF EXISTS public.pncp_licitacoes_sem_itens_para_ingestao(integer);
CREATE FUNCTION public.pncp_licitacoes_sem_itens_para_ingestao(p_limit integer DEFAULT 200)
RETURNS TABLE (id uuid, numero_controle_pncp text, cnpj text, ano integer, seq integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    UPDATE public.itens_backfill_queue q
       SET status = 'claimed', attempts = q.attempts + 1, claimed_at = now(), updated_at = now()
     WHERE q.licitacao_id IN (
       SELECT s.licitacao_id
         FROM public.itens_backfill_queue s
        WHERE s.status = 'pending'
           OR (s.status = 'claimed' AND s.claimed_at < now() - interval '30 minutes')
        ORDER BY s.data_publicacao DESC NULLS LAST
        LIMIT GREATEST(1, LEAST(p_limit, 3000))
        FOR UPDATE SKIP LOCKED
     )
     RETURNING q.licitacao_id, q.numero_controle_pncp
  )
  SELECT c.licitacao_id,
         c.numero_controle_pncp,
         substring(c.numero_controle_pncp FROM '^(\d{14})'),
         substring(c.numero_controle_pncp FROM '/(\d{4})$')::int,
         substring(c.numero_controle_pncp FROM '-(\d+)/\d{4}$')::int
    FROM claimed c;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.cleanup_itens_backfill_queue()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_n integer;
BEGIN
  DELETE FROM public.itens_backfill_queue q
   WHERE q.status = 'claimed'
     AND EXISTS (SELECT 1 FROM public.licitacao_itens li WHERE li.licitacao_id = q.licitacao_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$fn$;

REVOKE ALL ON FUNCTION public.seed_itens_backfill_queue(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refill_itens_backfill_queue(interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_itens_backfill_queue() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pncp_licitacoes_sem_itens_para_ingestao(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_itens_backfill_queue(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.refill_itens_backfill_queue(interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_itens_backfill_queue() TO service_role;
GRANT EXECUTE ON FUNCTION public.pncp_licitacoes_sem_itens_para_ingestao(integer) TO service_role;