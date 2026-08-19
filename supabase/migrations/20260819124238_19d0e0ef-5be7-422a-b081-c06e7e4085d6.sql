
CREATE OR REPLACE FUNCTION public.get_orfaos_dadosabertos(p_limit integer DEFAULT 100)
RETURNS TABLE(compra_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '20s'
AS $function$
DECLARE
  v_scan int := GREATEST(p_limit * 20, 2000);
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT pr.id, pr.payload->>'numeroControlePncpCompra' AS k
    FROM public.pncp_raw pr
    WHERE pr.tipo = 'contrato'
      AND pr.processado = false
    ORDER BY pr.coletado_em DESC
    LIMIT v_scan
    FOR UPDATE SKIP LOCKED
  ),
  marked AS (
    UPDATE public.pncp_raw pr
       SET processado = true
      FROM claimed c
     WHERE pr.id = c.id
    RETURNING c.k
  )
  SELECT DISTINCT m.k
  FROM marked m
  WHERE m.k IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.licitacoes l
      WHERE l.numero_controle_pncp = m.k
    )
  LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pncp_gaps_dispatch()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  st text;
  until timestamptz;
BEGIN
  SELECT state, open_until INTO st, until FROM public.pncp_circuit WHERE source = 'compras';

  IF st = 'open' AND until IS NOT NULL AND until > now() THEN
    RETURN 'skipped: circuit open until ' || until::text;
  END IF;

  PERFORM net.http_post(
    url := 'https://eiksdfobghixofsxskke.supabase.co/functions/v1/internal-cron-dispatcher',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpa3NkZm9iZ2hpeG9mc3hza2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NzY0MzcsImV4cCI6MjA4NzU1MjQzN30.30O_CNCvL_WpoL0a40oKILdQyt9cY1ZXPZYw_ogeecc"}'::jsonb,
    body := '{"target":"pncp-fill-gaps","payload":{"mode":"drain","limit":300,"parallel":4,"paceMs":150,"paceMinMs":90,"paceMaxMs":5000}}'::jsonb
  );
  RETURN 'dispatched';
END;
$function$;

UPDATE public.cron_autoscale_state
   SET max_parallel = GREATEST(max_parallel, 6),
       max_limit = GREATEST(max_limit, 400),
       updated_at = now()
 WHERE target = 'gaps';
