CREATE OR REPLACE FUNCTION public.pncp_circuit_report(p_source text, p_ok boolean, p_reason text DEFAULT NULL, p_threshold integer DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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

  IF r.state = 'half_open' OR (r.failures + 1) >= p_threshold THEN
    -- Backoff mais curto: base 30s, teto 5min, no maximo 4 degraus.
    v_trips := LEAST(r.trips + 1, 4);
    v_wait := make_interval(secs => LEAST(30 * POWER(2, v_trips - 1)::int, 300));
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
$fn$;

UPDATE public.cron_autoscale_state
   SET max_limit = 3000,
       max_parallel = 32,
       limit_per_run = 1500,
       parallelism = 20,
       min_limit = 600,
       min_parallel = 10,
       updated_at = now()
 WHERE target = 'backfill-itens';

-- Reabre os circuitos degradados agora, com o novo backoff curto.
UPDATE public.pncp_circuit
   SET state = 'half_open', open_until = NULL, trips = LEAST(trips, 2), failures = 0, updated_at = now()
 WHERE state = 'open';