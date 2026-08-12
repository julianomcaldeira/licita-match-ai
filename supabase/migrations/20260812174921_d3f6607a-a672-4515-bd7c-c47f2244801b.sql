CREATE TABLE IF NOT EXISTS public.pncp_circuit (
  source text PRIMARY KEY,
  state text NOT NULL DEFAULT 'closed',
  failures integer NOT NULL DEFAULT 0,
  successes integer NOT NULL DEFAULT 0,
  trips integer NOT NULL DEFAULT 0,
  last_reason text,
  open_until timestamptz,
  last_opened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pncp_circuit TO authenticated;
GRANT ALL ON public.pncp_circuit TO service_role;

ALTER TABLE public.pncp_circuit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated can read circuit" ON public.pncp_circuit;
CREATE POLICY "authenticated can read circuit"
ON public.pncp_circuit FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS update_pncp_circuit_updated_at ON public.pncp_circuit;
CREATE TRIGGER update_pncp_circuit_updated_at
BEFORE UPDATE ON public.pncp_circuit
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.pncp_circuit(source) VALUES ('contratos')
ON CONFLICT (source) DO NOTHING;

-- Libera ou nao a execucao. Em estado aberto expirado, passa para half_open
-- (deixa passar 1 tentativa de sondagem).
CREATE OR REPLACE FUNCTION public.pncp_circuit_allow(p_source text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r public.pncp_circuit;
BEGIN
  INSERT INTO public.pncp_circuit(source) VALUES (p_source)
  ON CONFLICT (source) DO NOTHING;

  SELECT * INTO r FROM public.pncp_circuit WHERE source = p_source FOR UPDATE;

  IF r.state = 'open' THEN
    IF r.open_until IS NOT NULL AND r.open_until > now() THEN
      RETURN false;
    END IF;
    UPDATE public.pncp_circuit
       SET state = 'half_open', updated_at = now()
     WHERE source = p_source;
    RETURN true;
  END IF;

  RETURN true;
END;
$$;

-- Registra resultado. Falhas relevantes (503/timeout/abort) abrem o circuito
-- com backoff progressivo: 1, 2, 4, 8, 16, 30 minutos (teto 30min).
CREATE OR REPLACE FUNCTION public.pncp_circuit_report(
  p_source text,
  p_ok boolean,
  p_reason text DEFAULT NULL,
  p_threshold integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.pncp_circuit;
  v_wait interval;
  v_trips int;
BEGIN
  INSERT INTO public.pncp_circuit(source) VALUES (p_source)
  ON CONFLICT (source) DO NOTHING;

  SELECT * INTO r FROM public.pncp_circuit WHERE source = p_source FOR UPDATE;

  IF p_ok THEN
    UPDATE public.pncp_circuit
       SET state = 'closed',
           failures = 0,
           trips = 0,
           successes = r.successes + 1,
           open_until = NULL,
           last_reason = NULL,
           updated_at = now()
     WHERE source = p_source;
    RETURN jsonb_build_object('state','closed');
  END IF;

  -- falha
  IF r.state = 'half_open' OR (r.failures + 1) >= p_threshold THEN
    v_trips := LEAST(r.trips + 1, 6);
    v_wait := make_interval(secs => LEAST(60 * POWER(2, v_trips - 1)::int, 1800));
    UPDATE public.pncp_circuit
       SET state = 'open',
           failures = r.failures + 1,
           trips = v_trips,
           open_until = now() + v_wait,
           last_opened_at = now(),
           last_reason = p_reason,
           updated_at = now()
     WHERE source = p_source;
    RETURN jsonb_build_object('state','open','open_until', now() + v_wait, 'trips', v_trips);
  END IF;

  UPDATE public.pncp_circuit
     SET failures = r.failures + 1,
         last_reason = p_reason,
         updated_at = now()
   WHERE source = p_source;
  RETURN jsonb_build_object('state', r.state, 'failures', r.failures + 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.pncp_circuit_status()
RETURNS TABLE(source text, state text, failures integer, trips integer, open_until timestamptz, last_reason text, updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT source, state, failures, trips, open_until, last_reason, updated_at
  FROM public.pncp_circuit ORDER BY source;
$$;

-- O tick de contratos respeita o circuito
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
  v_allowed boolean;
  v_open_until timestamptz;
BEGIN
  v_allowed := public.pncp_circuit_allow('contratos');
  IF NOT v_allowed THEN
    SELECT open_until INTO v_open_until FROM public.pncp_circuit WHERE source = 'contratos';
    RETURN jsonb_build_object('dispatched', 0, 'paused', true, 'retry_at', v_open_until);
  END IF;

  -- em half_open despacha apenas 1 sondagem
  IF EXISTS (SELECT 1 FROM public.pncp_circuit WHERE source = 'contratos' AND state = 'half_open') THEN
    p_limit := 1;
  END IF;

  IF (EXTRACT(minute FROM now())::int % 30) = 0 THEN
    PERFORM public.refresh_contratos_dia_queue();
  END IF;

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