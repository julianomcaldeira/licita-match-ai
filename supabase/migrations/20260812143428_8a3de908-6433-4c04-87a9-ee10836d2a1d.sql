ALTER TABLE public.contratos_dia_queue
  ADD COLUMN IF NOT EXISTS pagina integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.mark_contratos_dia(
  p_dia date,
  p_status text,
  p_contratos integer DEFAULT 0,
  p_error text DEFAULT NULL,
  p_pagina integer DEFAULT 1,
  p_acumula boolean DEFAULT false
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.contratos_dia_queue
     SET status = p_status,
         contratos = CASE WHEN p_acumula THEN contratos + COALESCE(p_contratos,0)
                          ELSE GREATEST(contratos, COALESCE(p_contratos,0)) END,
         pagina = GREATEST(1, COALESCE(p_pagina,1)),
         last_error = p_error,
         attempts = CASE WHEN p_status = 'pending' AND p_error IS NULL THEN 0 ELSE attempts END,
         claimed_at = NULL,
         updated_at = now()
   WHERE dia = p_dia;
$$;

CREATE OR REPLACE FUNCTION public.refresh_contratos_dia_queue(p_recent_days integer DEFAULT 3)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ins int; v_reopen int;
BEGIN
  INSERT INTO public.contratos_dia_queue (dia)
  SELECT d::date
  FROM generate_series('2024-01-01'::date, (now() AT TIME ZONE 'UTC')::date, '1 day') d
  ON CONFLICT (dia) DO NOTHING;
  GET DIAGNOSTICS v_ins = ROW_COUNT;

  -- dias recentes voltam para a fila, mas no máximo 1x a cada 6h (evita churn)
  UPDATE public.contratos_dia_queue
     SET status = 'pending', pagina = 1, attempts = 0, claimed_at = NULL, updated_at = now()
   WHERE dia >= ((now() AT TIME ZONE 'UTC')::date - p_recent_days)
     AND status IN ('done','failed')
     AND updated_at < now() - interval '6 hours';
  GET DIAGNOSTICS v_reopen = ROW_COUNT;

  -- destrava dias presos há mais de 5 minutos
  UPDATE public.contratos_dia_queue
     SET status = CASE WHEN attempts >= 12 THEN 'failed' ELSE 'pending' END,
         claimed_at = NULL, updated_at = now()
   WHERE status = 'processing' AND claimed_at < now() - interval '5 minutes';

  -- devolve dias que falharam por timeout/rede para nova tentativa
  UPDATE public.contratos_dia_queue
     SET status = 'pending', claimed_at = NULL, attempts = 0, updated_at = now()
   WHERE status = 'failed' AND attempts < 12
     AND updated_at < now() - interval '30 minutes';

  RETURN jsonb_build_object('inseridos', v_ins, 'reabertos', v_reopen);
END;
$$;

CREATE OR REPLACE FUNCTION public.contratos_dia_tick(p_limit integer DEFAULT 6)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpa3NkZm9iZ2hpeG9mc3hza2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NzY0MzcsImV4cCI6MjA4NzU1MjQzN30.30O_CNCvL_WpoL0a40oKILdQyt9cY1ZXPZYw_ogeecc';
  r record;
  v_n int := 0;
BEGIN
  PERFORM public.refresh_contratos_dia_queue();

  FOR r IN
    UPDATE public.contratos_dia_queue q
       SET status = 'processing', attempts = q.attempts + 1, claimed_at = now(), updated_at = now()
     WHERE q.dia IN (
       SELECT dia FROM public.contratos_dia_queue
        WHERE status = 'pending'
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
$$;