
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

REVOKE ALL ON FUNCTION public.ingestao_check_estagnacao() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE r jsonb;
BEGIN
  r := public.ingestao_regime_tick();
  RAISE NOTICE 'regime tick: %', r;
END $$;
