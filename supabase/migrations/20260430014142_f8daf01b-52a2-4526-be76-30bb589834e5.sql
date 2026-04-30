-- Reserva atômica do próximo lote: avança o cursor e devolve as licitações da janela
CREATE OR REPLACE FUNCTION public.claim_winners_batch(p_limit integer DEFAULT 500)
RETURNS TABLE(id uuid, numero_controle_pncp text, raw_json jsonb, created_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  v_cursor TIMESTAMPTZ;
  v_max_in_batch TIMESTAMPTZ;
  v_lock_ok BOOLEAN;
BEGIN
  -- Try to acquire advisory lock (non-blocking) so only one worker advances at a time
  v_lock_ok := pg_try_advisory_xact_lock(72491);
  IF NOT v_lock_ok THEN
    -- Another worker is reserving right now; return empty so this one retries next minute
    RETURN;
  END IF;

  SELECT NULLIF(last_date_processed, '')::timestamptz INTO v_cursor
  FROM sync_status
  WHERE api_source = 'pncp-winners-backlog' AND modalidade = 0
  FOR UPDATE;

  -- Pick the batch
  CREATE TEMP TABLE IF NOT EXISTS _claimed_lic (
    id uuid, numero_controle_pncp text, raw_json jsonb, created_at timestamptz
  ) ON COMMIT DROP;
  TRUNCATE _claimed_lic;

  INSERT INTO _claimed_lic
  SELECT l.id, l.numero_controle_pncp, l.raw_json, l.created_at
  FROM licitacoes l
  WHERE l.numero_controle_pncp IS NOT NULL
    AND (v_cursor IS NULL OR l.created_at > v_cursor)
    AND (
      NOT EXISTS (SELECT 1 FROM licitacao_itens li WHERE li.licitacao_id = l.id)
      OR (
        COALESCE(l.valor_homologado, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM licitacao_itens li
          JOIN licitacao_vencedores lv ON lv.item_id = li.id
          WHERE li.licitacao_id = l.id
        )
      )
    )
  ORDER BY l.created_at ASC
  LIMIT p_limit;

  -- Advance the cursor immediately so other workers skip this window
  SELECT MAX(c.created_at) INTO v_max_in_batch FROM _claimed_lic c;

  IF v_max_in_batch IS NOT NULL THEN
    UPDATE sync_status
    SET last_date_processed = v_max_in_batch::text,
        updated_at = now()
    WHERE api_source = 'pncp-winners-backlog' AND modalidade = 0;
  ELSE
    -- End of queue: reset cursor for next cycle
    UPDATE sync_status
    SET last_date_processed = '',
        updated_at = now()
    WHERE api_source = 'pncp-winners-backlog' AND modalidade = 0;
  END IF;

  RETURN QUERY SELECT * FROM _claimed_lic;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_winners_batch(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_winners_batch(integer) TO service_role;