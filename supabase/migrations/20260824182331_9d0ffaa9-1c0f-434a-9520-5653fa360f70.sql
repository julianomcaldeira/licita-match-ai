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

  CREATE TEMP TABLE IF NOT EXISTS tmp_janela (id uuid, numero_controle_pncp text, data_publicacao date) ON COMMIT DROP;
  DELETE FROM tmp_janela;

  INSERT INTO tmp_janela
  SELECT l.id, l.numero_controle_pncp, l.data_publicacao
    FROM public.licitacoes l
   WHERE (v_last IS NULL OR l.id > v_last)
   ORDER BY l.id
   LIMIT GREATEST(1000, LEAST(p_batch, 200000));

  SELECT count(*) INTO v_scanned FROM tmp_janela;
  SELECT id INTO v_max FROM tmp_janela ORDER BY id DESC LIMIT 1;

  WITH ins AS (
    INSERT INTO public.itens_backfill_queue (licitacao_id, numero_controle_pncp, data_publicacao)
    SELECT j.id, j.numero_controle_pncp, j.data_publicacao
      FROM tmp_janela j
     WHERE j.numero_controle_pncp ~ '^\d{14}-\d+-\d+/\d{4}$'
       AND NOT EXISTS (SELECT 1 FROM public.licitacao_itens li WHERE li.licitacao_id = j.id)
    ON CONFLICT (licitacao_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_enq FROM ins;

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
REVOKE ALL ON FUNCTION public.seed_itens_backfill_queue(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_itens_backfill_queue(integer) TO service_role;