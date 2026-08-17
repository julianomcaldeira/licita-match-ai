
-- 1) Tabela de alertas operacionais de ingestão
CREATE TABLE IF NOT EXISTS public.ingestao_alertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  severidade text NOT NULL DEFAULT 'warning',
  titulo text NOT NULL,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolvido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingestao_alertas_tipo_aberto
  ON public.ingestao_alertas (tipo, created_at DESC) WHERE resolvido_em IS NULL;

GRANT SELECT ON public.ingestao_alertas TO authenticated;
GRANT ALL ON public.ingestao_alertas TO service_role;

ALTER TABLE public.ingestao_alertas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_central le alertas" ON public.ingestao_alertas;
CREATE POLICY "admin_central le alertas"
  ON public.ingestao_alertas FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin_central'));

DROP TRIGGER IF EXISTS trg_ingestao_alertas_updated_at ON public.ingestao_alertas;
CREATE TRIGGER trg_ingestao_alertas_updated_at
  BEFORE UPDATE ON public.ingestao_alertas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Alarme de estagnacao
CREATE OR REPLACE FUNCTION public.ingestao_check_estagnacao()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hoje bigint;
  v_cursor text;
  v_cursor_at timestamptz;
  v_horas numeric;
  v_alertas jsonb := '[]'::jsonb;

  PROCEDURE_placeholder int;
BEGIN
  SELECT count(*) INTO v_hoje
  FROM public.licitacoes
  WHERE created_at >= date_trunc('day', now());

  SELECT last_date_processed, updated_at INTO v_cursor, v_cursor_at
  FROM public.sync_status
  WHERE api_source = 'pncp-dadosabertos' AND modalidade = 0
  LIMIT 1;

  v_horas := CASE WHEN v_cursor_at IS NULL THEN NULL
                  ELSE EXTRACT(EPOCH FROM (now() - v_cursor_at)) / 3600 END;

  -- volume diario abaixo do piso (so avalia apos as 12h UTC, para nao alarmar de madrugada)
  IF EXTRACT(HOUR FROM now() AT TIME ZONE 'UTC') >= 12 AND v_hoje < 1000 THEN
    INSERT INTO public.ingestao_alertas (tipo, severidade, titulo, detalhes)
    SELECT 'volume_diario_baixo', 'critico',
           format('Apenas %s licitacoes ingeridas hoje (piso: 1.000)', v_hoje),
           jsonb_build_object('licitacoes_hoje', v_hoje, 'piso', 1000)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.ingestao_alertas
      WHERE tipo = 'volume_diario_baixo' AND resolvido_em IS NULL
        AND created_at >= date_trunc('day', now())
    );
    v_alertas := v_alertas || jsonb_build_array('volume_diario_baixo');
  ELSE
    UPDATE public.ingestao_alertas SET resolvido_em = now()
    WHERE tipo = 'volume_diario_baixo' AND resolvido_em IS NULL;
  END IF;

  -- cursor da fonte diaria parado ha mais de 24h
  IF v_horas IS NOT NULL AND v_horas > 24 THEN
    INSERT INTO public.ingestao_alertas (tipo, severidade, titulo, detalhes)
    SELECT 'cursor_parado', 'critico',
           format('Cursor da fonte diaria parado ha %sh (em %s)', round(v_horas), COALESCE(v_cursor,'-')),
           jsonb_build_object('cursor', v_cursor, 'horas_sem_avanco', round(v_horas, 1))
    WHERE NOT EXISTS (
      SELECT 1 FROM public.ingestao_alertas
      WHERE tipo = 'cursor_parado' AND resolvido_em IS NULL
    );
    v_alertas := v_alertas || jsonb_build_array('cursor_parado');
  ELSE
    UPDATE public.ingestao_alertas SET resolvido_em = now()
    WHERE tipo = 'cursor_parado' AND resolvido_em IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'licitacoes_hoje', v_hoje,
    'cursor', v_cursor,
    'horas_sem_avanco', round(COALESCE(v_horas, 0), 1),
    'alertas', v_alertas
  );
END;
$$;

-- 3) Troca automatica: modo backfill <-> modo regime permanente
CREATE OR REPLACE FUNCTION public.ingestao_ajusta_modo()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pendentes bigint;
  v_modo_atual text;
  v_modo text;
BEGIN
  SELECT count(*) INTO v_pendentes FROM public.pncp_gap_queue WHERE status = 'pending';

  SELECT COALESCE(max(last_reason), '') INTO v_modo_atual
  FROM public.cron_autoscale_state
  WHERE last_reason LIKE 'modo:%';

  IF v_pendentes < 5000 THEN
    v_modo := 'regime';
  ELSIF v_pendentes > 50000 THEN
    v_modo := 'backfill';
  ELSE
    v_modo := CASE WHEN v_modo_atual LIKE 'modo:regime%' THEN 'regime' ELSE 'backfill' END;
  END IF;

  IF v_modo = 'regime' THEN
    -- paralelismo residual minimo na API de consulta
    UPDATE public.cron_autoscale_state
       SET max_parallel = LEAST(max_parallel, 2),
           parallelism = LEAST(parallelism, 2),
           min_parallel = LEAST(min_parallel, 1),
           last_reason = 'modo:regime (fila=' || v_pendentes || ')',
           updated_at = now();
    -- reconciliacao leve: 1x/dia
    PERFORM cron.unschedule('reconcile-gap-queue')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-gap-queue');
    PERFORM cron.schedule('reconcile-gap-queue-leve', '20 3 * * *',
                          'SELECT public.reconcile_gap_queue(20000);')
      WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-gap-queue-leve');
  ELSE
    UPDATE public.cron_autoscale_state
       SET max_parallel = GREATEST(max_parallel, 8),
           last_reason = 'modo:backfill (fila=' || v_pendentes || ')',
           updated_at = now();
    PERFORM cron.unschedule('reconcile-gap-queue-leve')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-gap-queue-leve');
    PERFORM cron.schedule('reconcile-gap-queue', '*/2 * * * *',
                          'SELECT public.reconcile_gap_queue(20000);')
      WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-gap-queue');
  END IF;

  RETURN jsonb_build_object('modo', v_modo, 'fila_pendente', v_pendentes);
END;
$$;

-- 4) Tick horario
CREATE OR REPLACE FUNCTION public.ingestao_regime_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v jsonb;
BEGIN
  v := jsonb_build_object(
    'modo', public.ingestao_ajusta_modo(),
    'estagnacao', public.ingestao_check_estagnacao()
  );
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.ingestao_check_estagnacao() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ingestao_ajusta_modo() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ingestao_regime_tick() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('ingestao-regime-tick')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ingestao-regime-tick');
SELECT cron.schedule('ingestao-regime-tick', '10 * * * *', 'SELECT public.ingestao_regime_tick();');
