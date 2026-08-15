
-- 1) Reconciliação: marca gaps já cobertos pelo caminho de lote (Dados Abertos)
CREATE OR REPLACE FUNCTION public.reconcile_gap_queue(p_limit integer DEFAULT 20000)
RETURNS TABLE(scanned integer, reconciled integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '120s'
AS $$
DECLARE
  v_scanned integer := 0;
  v_done integer := 0;
BEGIN
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

  RETURN QUERY SELECT v_scanned, v_done;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_gap_queue(integer) FROM PUBLIC, anon, authenticated;

-- 2) Varredura em lote do histórico de 2023 via Dados Abertos
CREATE OR REPLACE FUNCTION public.pncp_dadosabertos_backfill_2023_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cursor TEXT;
  v_stop   TEXT := '20240103';
  v_start  TEXT;
  v_end    TEXT;
  v_anon   TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpa3NkZm9iZ2hpeG9mc3hza2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NzY0MzcsImV4cCI6MjA4NzU1MjQzN30.30O_CNCvL_WpoL0a40oKILdQyt9cY1ZXPZYw_ogeecc';
  v_dispatched int := 0;
  v_windows jsonb := '[]'::jsonb;
  v_state text;
  v_until timestamptz;
  i int;
BEGIN
  -- não empurra carga enquanto o circuito de contratos estiver aberto
  SELECT state, open_until INTO v_state, v_until
    FROM public.pncp_circuit WHERE source = 'contratos';
  IF v_state = 'open' AND v_until IS NOT NULL AND v_until > now() THEN
    RETURN jsonb_build_object('skipped', 'circuit_open', 'until', v_until);
  END IF;

  INSERT INTO public.sync_status (api_source, modalidade, last_date_processed)
  VALUES ('pncp-dadosabertos-backfill-2023', 0, '20221231')
  ON CONFLICT DO NOTHING;

  SELECT last_date_processed INTO v_cursor
    FROM public.sync_status
   WHERE api_source = 'pncp-dadosabertos-backfill-2023' AND modalidade = 0
   FOR UPDATE;

  IF v_cursor IS NULL OR v_cursor = '' THEN
    v_cursor := '20221231';
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
   WHERE api_source = 'pncp-dadosabertos-backfill-2023' AND modalidade = 0;

  RETURN jsonb_build_object('dispatched', v_dispatched, 'cursor', v_cursor, 'windows', v_windows);
END;
$$;

REVOKE ALL ON FUNCTION public.pncp_dadosabertos_backfill_2023_tick() FROM PUBLIC, anon, authenticated;

-- 3) Resumo de progresso das duas rotas
CREATE OR REPLACE FUNCTION public.ingestao_rotas_resumo()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'lote_cursor_2024', (SELECT last_date_processed FROM sync_status
                          WHERE api_source='pncp-dadosabertos-backfill' AND modalidade=0),
    'lote_cursor_2023', (SELECT last_date_processed FROM sync_status
                          WHERE api_source='pncp-dadosabertos-backfill-2023' AND modalidade=0),
    'fila_pendente',    (SELECT count(*) FROM pncp_gap_queue WHERE status='pending'),
    'fila_processando', (SELECT count(*) FROM pncp_gap_queue WHERE status='processing'),
    'fila_falhas',      (SELECT count(*) FROM pncp_gap_queue WHERE status='failed'),
    'circuito', (SELECT jsonb_object_agg(source, jsonb_build_object('state', state, 'open_until', open_until))
                   FROM pncp_circuit)
  );
$$;

GRANT EXECUTE ON FUNCTION public.ingestao_rotas_resumo() TO authenticated;
