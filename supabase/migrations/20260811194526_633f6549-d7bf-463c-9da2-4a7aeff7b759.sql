
-- 1) Fila diária de contratos
CREATE TABLE IF NOT EXISTS public.contratos_dia_queue (
  dia date PRIMARY KEY,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  contratos integer NOT NULL DEFAULT 0,
  last_error text,
  claimed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.contratos_dia_queue TO authenticated;
GRANT ALL ON public.contratos_dia_queue TO service_role;

ALTER TABLE public.contratos_dia_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read contratos_dia_queue" ON public.contratos_dia_queue;
CREATE POLICY "Authenticated can read contratos_dia_queue"
ON public.contratos_dia_queue FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_contratos_dia_queue_status ON public.contratos_dia_queue (status, dia);

-- 2) Semear / reabrir dias
CREATE OR REPLACE FUNCTION public.refresh_contratos_dia_queue(p_recent_days integer DEFAULT 10)
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

  -- dias recentes sempre voltam para a fila (PNCP publica com atraso)
  UPDATE public.contratos_dia_queue
     SET status = 'pending', claimed_at = NULL, updated_at = now()
   WHERE dia >= ((now() AT TIME ZONE 'UTC')::date - p_recent_days)
     AND status IN ('done','failed');
  GET DIAGNOSTICS v_reopen = ROW_COUNT;

  -- destrava dias presos há mais de 15 minutos
  UPDATE public.contratos_dia_queue
     SET status = CASE WHEN attempts >= 6 THEN 'failed' ELSE 'pending' END,
         claimed_at = NULL, updated_at = now()
   WHERE status = 'processing' AND claimed_at < now() - interval '15 minutes';

  RETURN jsonb_build_object('inseridos', v_ins, 'reabertos', v_reopen);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_contratos_dia_queue(integer) FROM PUBLIC, anon, authenticated;

-- 3) Marcar resultado
CREATE OR REPLACE FUNCTION public.mark_contratos_dia(p_dia date, p_status text, p_contratos integer DEFAULT 0, p_error text DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.contratos_dia_queue
     SET status = p_status,
         contratos = GREATEST(contratos, COALESCE(p_contratos,0)),
         last_error = p_error,
         claimed_at = NULL,
         updated_at = now()
   WHERE dia = p_dia;
$$;

REVOKE ALL ON FUNCTION public.mark_contratos_dia(date, text, integer, text) FROM PUBLIC, anon, authenticated;

-- 4) Tick: reivindica dias e dispara uma execução por dia
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
        ORDER BY dia DESC
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
     )
    RETURNING q.dia
  LOOP
    PERFORM net.http_post(
      url := 'https://eiksdfobghixofsxskke.supabase.co/functions/v1/internal-cron-dispatcher',
      headers := jsonb_build_object('Content-Type','application/json','apikey', v_anon),
      body := jsonb_build_object(
        'target','ingest-pncp-dadosabertos',
        'payload', jsonb_build_object('mode','dia','dia', to_char(r.dia,'YYYYMMDD'))
      )
    );
    v_n := v_n + 1;
  END LOOP;

  RETURN jsonb_build_object('dispatched', v_n);
END;
$$;

REVOKE ALL ON FUNCTION public.contratos_dia_tick(integer) FROM PUBLIC, anon, authenticated;

-- 5) Resumo da fila (para o monitor)
CREATE OR REPLACE FUNCTION public.contratos_queue_summary()
RETURNS TABLE(status text, dias bigint, contratos bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status, count(*)::bigint, coalesce(sum(contratos),0)::bigint
  FROM public.contratos_dia_queue GROUP BY status ORDER BY status;
$$;

GRANT EXECUTE ON FUNCTION public.contratos_queue_summary() TO authenticated;

-- 6) Cobertura de contratos por mês (usada para alertar índice parcial)
CREATE OR REPLACE FUNCTION public.indice_cobertura_mes(p_mes text)
RETURNS TABLE(
  dias_total integer,
  dias_ok integer,
  dias_pendentes integer,
  pct_cobertura numeric,
  contratos_mes bigint,
  confiavel boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start date := to_date(p_mes || '-01', 'YYYY-MM-DD');
  v_end date := (to_date(p_mes || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date;
BEGIN
  RETURN QUERY
  WITH q AS (
    SELECT * FROM public.contratos_dia_queue WHERE dia BETWEEN v_start AND LEAST(v_end, (now() AT TIME ZONE 'UTC')::date)
  ), c AS (
    SELECT count(*)::bigint n FROM public.contratos
     WHERE coalesce(data_efetiva, data_assinatura, data_publicacao) BETWEEN v_start AND v_end
  )
  SELECT
    (SELECT count(*) FROM q)::int,
    (SELECT count(*) FROM q WHERE status = 'done')::int,
    (SELECT count(*) FROM q WHERE status <> 'done')::int,
    CASE WHEN (SELECT count(*) FROM q) = 0 THEN 0
         ELSE round(100.0 * (SELECT count(*) FROM q WHERE status='done') / (SELECT count(*) FROM q), 1) END,
    (SELECT n FROM c),
    (SELECT count(*) FROM q) > 0
      AND (SELECT count(*) FROM q WHERE status='done') = (SELECT count(*) FROM q)
      AND v_end < (now() AT TIME ZONE 'UTC')::date;
END;
$$;

GRANT EXECUTE ON FUNCTION public.indice_cobertura_mes(text) TO authenticated;

-- 7) Cron: dispara a fila a cada minuto e desativa o backfill antigo (janelas de 30 dias que estouravam o tempo)
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('pncp-dadosabertos-backfill-fast','pncp-dadosabertos-backfill','contratos-dia-tick');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('contratos-dia-tick', '* * * * *', $$SELECT public.contratos_dia_tick(6);$$);
