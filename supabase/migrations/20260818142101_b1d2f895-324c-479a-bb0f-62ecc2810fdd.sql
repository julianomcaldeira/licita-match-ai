CREATE TABLE IF NOT EXISTS public.pncp_reconcile_state (
  id text PRIMARY KEY DEFAULT 'gap_queue',
  last_cnpj text NOT NULL DEFAULT '',
  last_ano integer NOT NULL DEFAULT 0,
  last_seq integer NOT NULL DEFAULT 0,
  cycle integer NOT NULL DEFAULT 1,
  scanned_cycle bigint NOT NULL DEFAULT 0,
  reconciled_cycle bigint NOT NULL DEFAULT 0,
  last_run_at timestamptz,
  last_duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pncp_reconcile_state TO authenticated;
GRANT ALL ON public.pncp_reconcile_state TO service_role;

ALTER TABLE public.pncp_reconcile_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin central le estado de reconciliacao" ON public.pncp_reconcile_state;
CREATE POLICY "admin central le estado de reconciliacao"
ON public.pncp_reconcile_state FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin_central'));

INSERT INTO public.pncp_reconcile_state (id) VALUES ('gap_queue')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.reconcile_gap_queue(p_limit integer DEFAULT 20000)
RETURNS TABLE(scanned integer, reconciled integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '120s'
AS $function$
DECLARE
  v_batch integer := GREATEST(1000, LEAST(COALESCE(p_limit, 20000), 20000));
  v_deadline timestamptz := clock_timestamp() + interval '55 seconds';
  v_started timestamptz := clock_timestamp();
  v_scanned integer := 0;
  v_done integer := 0;
  v_recent integer := 0;
  v_b_scanned integer;
  v_b_done integer;
  v_cnpj text;
  v_ano integer;
  v_seq integer;
  v_last_cnpj text;
  v_last_ano integer;
  v_last_seq integer;
BEGIN
  SELECT last_cnpj, last_ano, last_seq INTO v_cnpj, v_ano, v_seq
  FROM public.pncp_reconcile_state WHERE id = 'gap_queue' FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.pncp_reconcile_state (id) VALUES ('gap_queue')
    ON CONFLICT (id) DO NOTHING;
    v_cnpj := ''; v_ano := 0; v_seq := 0;
  END IF;

  -- (a) varredura em lotes por keyset sobre a PK (cnpj, ano, seq), com cursor persistente
  LOOP
    WITH cand AS (
      SELECT q.cnpj, q.ano, q.seq, q.status
      FROM public.pncp_gap_queue q
      WHERE (q.cnpj, q.ano, q.seq) > (v_cnpj, v_ano, v_seq)
      ORDER BY q.cnpj, q.ano, q.seq
      LIMIT v_batch
    ),
    matched AS (
      SELECT c.cnpj, c.ano, c.seq
      FROM cand c
      JOIN public.licitacoes l
        ON l.numero_controle_pncp =
           c.cnpj || '-1-' || lpad(c.seq::text, 6, '0') || '/' || c.ano::text
      WHERE c.status IN ('pending','failed','processing')
        AND EXISTS (SELECT 1 FROM public.licitacao_itens i WHERE i.licitacao_id = l.id)
    ),
    upd AS (
      UPDATE public.pncp_gap_queue q
         SET status = 'done', last_error = NULL, updated_at = now()
        FROM matched m
       WHERE q.cnpj = m.cnpj AND q.ano = m.ano AND q.seq = m.seq
         AND q.status <> 'done'
      RETURNING 1
    )
    SELECT (SELECT count(*) FROM cand),
           (SELECT count(*) FROM upd),
           (SELECT c.cnpj FROM cand c ORDER BY c.cnpj DESC, c.ano DESC, c.seq DESC LIMIT 1),
           (SELECT c.ano  FROM cand c ORDER BY c.cnpj DESC, c.ano DESC, c.seq DESC LIMIT 1),
           (SELECT c.seq  FROM cand c ORDER BY c.cnpj DESC, c.ano DESC, c.seq DESC LIMIT 1)
      INTO v_b_scanned, v_b_done, v_last_cnpj, v_last_ano, v_last_seq;

    v_scanned := v_scanned + COALESCE(v_b_scanned, 0);
    v_done := v_done + COALESCE(v_b_done, 0);

    IF COALESCE(v_b_scanned, 0) = 0 THEN
      -- fim da fila: reinicia o ciclo
      UPDATE public.pncp_reconcile_state
         SET last_cnpj = '', last_ano = 0, last_seq = 0,
             cycle = cycle + 1, scanned_cycle = 0, reconciled_cycle = 0,
             updated_at = now()
       WHERE id = 'gap_queue';
      v_cnpj := ''; v_ano := 0; v_seq := 0;
      EXIT;
    END IF;

    v_cnpj := v_last_cnpj; v_ano := v_last_ano; v_seq := v_last_seq;

    UPDATE public.pncp_reconcile_state
       SET last_cnpj = v_cnpj, last_ano = v_ano, last_seq = v_seq,
           scanned_cycle = scanned_cycle + COALESCE(v_b_scanned, 0),
           reconciled_cycle = reconciled_cycle + COALESCE(v_b_done, 0),
           updated_at = now()
     WHERE id = 'gap_queue';

    EXIT WHEN clock_timestamp() >= v_deadline;
  END LOOP;

  -- (b) conferencia dirigida pelo que entrou nas ultimas 6h (barato e sempre avanca)
  WITH nov AS (
    SELECT l.id, l.numero_controle_pncp
    FROM public.licitacoes l
    WHERE l.created_at > now() - interval '6 hours'
      AND l.numero_controle_pncp IS NOT NULL
    LIMIT 100000
  ),
  parsed AS (
    SELECT
      split_part(n.numero_controle_pncp, '-', 1) AS cnpj,
      split_part(split_part(n.numero_controle_pncp, '/', 2), '-', 1)::int AS ano,
      NULLIF(regexp_replace(split_part(split_part(n.numero_controle_pncp, '/', 1), '-', 3), '\D', '', 'g'), '')::int AS seq,
      n.id
    FROM nov n
    WHERE n.numero_controle_pncp ~ '^[0-9]{14}-[0-9]+-[0-9]+/[0-9]{4}$'
  ),
  ok AS (
    SELECT p.cnpj, p.ano, p.seq
    FROM parsed p
    WHERE p.seq IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.licitacao_itens i WHERE i.licitacao_id = p.id)
  ),
  upd2 AS (
    UPDATE public.pncp_gap_queue q
       SET status = 'done', last_error = NULL, updated_at = now()
      FROM ok
     WHERE q.cnpj = ok.cnpj AND q.ano = ok.ano AND q.seq = ok.seq
       AND q.status <> 'done'
    RETURNING 1
  )
  SELECT count(*) INTO v_recent FROM upd2;

  UPDATE public.pncp_reconcile_state
     SET last_run_at = now(),
         last_duration_ms = (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::int,
         updated_at = now()
   WHERE id = 'gap_queue';

  RETURN QUERY SELECT v_scanned, v_done + v_recent;
END;
$function$;