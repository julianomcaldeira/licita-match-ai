CREATE OR REPLACE FUNCTION public.contratos_dia_tick(p_limit integer DEFAULT 6)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpa3NkZm9iZ2hpeG9mc3hza2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NzY0MzcsImV4cCI6MjA4NzU1MjQzN30.30O_CNCvL_WpoL0a40oKILdQyt9cY1ZXPZYw_ogeecc';
  r record;
  v_n int := 0;
BEGIN
  IF (EXTRACT(minute FROM now())::int % 30) = 0 THEN
    PERFORM public.refresh_contratos_dia_queue();
  END IF;

  -- destrava dias em processing sem progresso ha mais de 5 minutos
  UPDATE public.contratos_dia_queue
     SET status = 'pending', claimed_at = NULL, updated_at = now()
   WHERE status = 'processing'
     AND GREATEST(COALESCE(claimed_at, updated_at), updated_at) < now() - interval '5 minutes';

  FOR r IN
    UPDATE public.contratos_dia_queue q
       SET status = 'processing', attempts = q.attempts + 1, claimed_at = now(), updated_at = now()
     WHERE q.dia IN (
       SELECT dia FROM public.contratos_dia_queue
        WHERE status = 'pending'
          AND next_attempt_at <= now()
        ORDER BY attempts ASC, dia DESC
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
     )
    RETURNING q.dia, q.pagina
  LOOP
    PERFORM net.http_post(
      url := 'https://eiksdfobghixofsxskke.supabase.co/functions/v1/internal-cron-dispatcher',
      headers := jsonb_build_object('Content-Type','application/json','apikey', v_anon),
      body := jsonb_build_object(
        'target','ingest-pncp-dadosabertos',
        'payload', jsonb_build_object(
          'mode','dia',
          'dia', to_char(r.dia,'YYYYMMDD'),
          'paginaInicial', GREATEST(1, COALESCE(r.pagina,1))
        )
      )
    );
    v_n := v_n + 1;
  END LOOP;

  RETURN jsonb_build_object('dispatched', v_n);
END;
$function$;