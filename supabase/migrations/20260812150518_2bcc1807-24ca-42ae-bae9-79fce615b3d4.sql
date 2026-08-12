ALTER TABLE public.contratos_dia_queue
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_contratos_dia_queue_ready
  ON public.contratos_dia_queue (status, next_attempt_at, attempts, dia DESC);

DROP FUNCTION IF EXISTS public.mark_contratos_dia(date, text, integer, text);

CREATE OR REPLACE FUNCTION public.mark_contratos_dia(
  p_dia date,
  p_status text,
  p_contratos integer DEFAULT 0,
  p_error text DEFAULT NULL::text,
  p_pagina integer DEFAULT 1,
  p_acumula boolean DEFAULT false
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.contratos_dia_queue
     SET status = p_status,
         contratos = CASE WHEN p_acumula THEN contratos + COALESCE(p_contratos,0)
                          ELSE GREATEST(contratos, COALESCE(p_contratos,0)) END,
         pagina = GREATEST(1, COALESCE(p_pagina,1)),
         last_error = p_error,
         -- progresso real (avancou de pagina) zera o contador de tentativas
         attempts = CASE
                      WHEN p_status = 'done' THEN attempts
                      WHEN COALESCE(p_pagina,1) > pagina THEN 0
                      WHEN p_error IS NULL THEN 0
                      ELSE attempts
                    END,
         next_attempt_at = CASE
                             WHEN p_status = 'done' THEN now()
                             WHEN p_error IS NULL OR COALESCE(p_pagina,1) > pagina THEN now()
                             ELSE now() + (LEAST(GREATEST(attempts,1), 10) * interval '90 seconds')
                           END,
         claimed_at = NULL,
         updated_at = now()
   WHERE dia = p_dia;
$function$;

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
  -- recalcula a lista de dias no maximo a cada 30 minutos
  IF (EXTRACT(minute FROM now())::int % 30) = 0 THEN
    PERFORM public.refresh_contratos_dia_queue();
  END IF;

  -- destrava dias presos em processing ha mais de 5 minutos
  UPDATE public.contratos_dia_queue
     SET status = 'pending', claimed_at = NULL, updated_at = now()
   WHERE status = 'processing'
     AND claimed_at IS NOT NULL
     AND claimed_at < now() - interval '5 minutes';

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