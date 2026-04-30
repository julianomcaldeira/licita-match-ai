-- Insert cursor row if not exists
INSERT INTO public.sync_status (api_source, modalidade, last_date_processed, total_synced)
VALUES ('pncp-winners-backlog', 0, '', 0)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_winners_backlog_cursor()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(last_date_processed, ''), '')
  FROM public.sync_status
  WHERE api_source = 'pncp-winners-backlog' AND modalidade = 0
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.set_winners_backlog_cursor(p_cursor text, p_processed integer DEFAULT 0)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.sync_status
  SET last_date_processed = COALESCE(p_cursor, ''),
      total_synced = COALESCE(total_synced, 0) + COALESCE(p_processed, 0),
      updated_at = now()
  WHERE api_source = 'pncp-winners-backlog' AND modalidade = 0;

  IF NOT FOUND THEN
    INSERT INTO public.sync_status (api_source, modalidade, last_date_processed, total_synced)
    VALUES ('pncp-winners-backlog', 0, COALESCE(p_cursor, ''), COALESCE(p_processed, 0));
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_winners_backlog_cursor() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_winners_backlog_cursor(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_winners_backlog_cursor() TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.set_winners_backlog_cursor(text, integer) TO service_role;