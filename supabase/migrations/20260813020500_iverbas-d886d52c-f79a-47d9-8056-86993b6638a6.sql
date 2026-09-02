
-- Add unique constraint for executive_reports upsert
ALTER TABLE public.executive_reports
  ADD CONSTRAINT executive_reports_mes_referencia_ano_key UNIQUE (mes_referencia, ano);

-- Add unique constraint for iscores upsert
ALTER TABLE public.iscores
  ADD CONSTRAINT iscores_entidade_score_periodo_key UNIQUE (entidade_tipo, entidade_nome, tipo_score, periodo);
