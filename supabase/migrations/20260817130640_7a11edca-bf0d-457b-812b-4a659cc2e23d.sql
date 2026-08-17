-- 1) Backfill histórico 2024 -> hoje (continuação do tick de 2023, que já concluiu)
CREATE OR REPLACE FUNCTION public.pncp_dadosabertos_backfill_2024_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cursor TEXT;
  v_stop   TEXT := to_char(now()::date - 1, 'YYYYMMDD');
  v_start  TEXT;
  v_end    TEXT;
  v_anon   TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpa3NkZm9iZ2hpeG9mc3hza2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NzY0MzcsImV4cCI6MjA4NzU1MjQzN30.30O_CNCvL_WpoL0a40oKILdQyt9cY1ZXPZYw_ogeecc';
  v_dispatched int := 0;
  v_windows jsonb := '[]'::jsonb;
  v_state text;
  v_until timestamptz;
  i int;
BEGIN
  SELECT state, open_until INTO v_state, v_until
    FROM public.pncp_circuit WHERE source = 'contratos';
  IF v_state = 'open' AND v_until IS NOT NULL AND v_until > now() THEN
    RETURN jsonb_build_object('skipped', 'circuit_open', 'until', v_until);
  END IF;

  INSERT INTO public.sync_status (api_source, modalidade, last_date_processed)
  VALUES ('pncp-dadosabertos-backfill-2024', 0, '20240103')
  ON CONFLICT DO NOTHING;

  SELECT last_date_processed INTO v_cursor
    FROM public.sync_status
   WHERE api_source = 'pncp-dadosabertos-backfill-2024' AND modalidade = 0
   FOR UPDATE;

  IF v_cursor IS NULL OR v_cursor = '' THEN
    v_cursor := '20240103';
  END IF;

  IF v_cursor >= v_stop THEN
    RETURN jsonb_build_object('done', true, 'cursor', v_cursor);
  END IF;

  FOR i IN 1..3 LOOP
    v_start := to_char((to_date(v_cursor,'YYYYMMDD') + 1), 'YYYYMMDD');
    EXIT WHEN v_start > v_stop;
    v_end := to_char((to_date(v_cursor,'YYYYMMDD') + 15), 'YYYYMMDD');
    IF v_end > v_stop THEN v_end := v_stop; END IF;

    PERFORM net.http_post(
      url := 'https://eiksdfobghixofsxskke.supabase.co/functions/v1/internal-cron-dispatcher',
      headers := jsonb_build_object('Content-Type','application/json','apikey', v_anon),
      body := jsonb_build_object(
        'target','ingest-pncp-dadosabertos',
        'payload', jsonb_build_object('mode','backfill','dataInicial',v_start,'dataFinal',v_end)
      )
    );

    v_windows := v_windows || jsonb_build_object('inicio',v_start,'fim',v_end);
    v_cursor := v_end;
    v_dispatched := v_dispatched + 1;
  END LOOP;

  UPDATE public.sync_status
     SET last_date_processed = v_cursor, updated_at = now()
   WHERE api_source = 'pncp-dadosabertos-backfill-2024' AND modalidade = 0;

  RETURN jsonb_build_object('dispatched', v_dispatched, 'cursor', v_cursor, 'windows', v_windows);
END;
$function$;

-- 2) Reconciliacao: alem da varredura padrao, conferir o que foi ingerido recentemente
CREATE OR REPLACE FUNCTION public.reconcile_gap_queue(p_limit integer DEFAULT 20000)
RETURNS TABLE(scanned integer, reconciled integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '120s'
AS $function$
DECLARE
  v_scanned integer := 0;
  v_done integer := 0;
  v_recent integer := 0;
BEGIN
  -- (a) varredura padrao sobre pendentes
  WITH cand AS (
    SELECT q.cnpj, q.ano, q.seq
    FROM public.pncp_gap_queue q
    WHERE q.status = 'pending'
    LIMIT p_limit
  ),
  matched AS (
    SELECT c.cnpj, c.ano, c.seq
    FROM cand c
    JOIN public.licitacoes l
      ON l.numero_controle_pncp =
         c.cnpj || '-1-' || lpad(c.seq::text, 6, '0') || '/' || c.ano::text
    WHERE EXISTS (
      SELECT 1 FROM public.licitacao_itens i WHERE i.licitacao_id = l.id
    )
  ),
  upd AS (
    UPDATE public.pncp_gap_queue q
       SET status = 'done', last_error = NULL, updated_at = now()
      FROM matched m
     WHERE q.cnpj = m.cnpj AND q.ano = m.ano AND q.seq = m.seq
       AND q.status = 'pending'
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM cand), (SELECT count(*) FROM upd)
    INTO v_scanned, v_done;

  -- (b) conferencia dirigida pelo que entrou nas ultimas 6h (barato e sempre avanca)
  WITH nov AS (
    SELECT l.id, l.numero_controle_pncp
    FROM public.licitacoes l
    WHERE l.created_at > now() - interval '6 hours'
      AND l.numero_controle_pncp IS NOT NULL
    LIMIT 200000
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

  RETURN QUERY SELECT v_scanned, v_done + v_recent;
END;
$function$;

-- 3) Agenda a nova varredura historica
SELECT cron.unschedule('pncp-dadosabertos-backfill-2024')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pncp-dadosabertos-backfill-2024');

SELECT cron.schedule(
  'pncp-dadosabertos-backfill-2024',
  '*/2 * * * *',
  $$SELECT public.pncp_dadosabertos_backfill_2024_tick();$$
);