
-- Tabela de histórico append-only de toda geração do Índice StartGi
CREATE TABLE IF NOT EXISTS public.indice_startgi_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes_referencia text NOT NULL,
  indice_startgi numeric(8,1),
  valor_total_brl numeric(18,2),
  volume_contratos integer,
  variacao_mom numeric(6,2),
  variacao_yoy numeric(6,2),
  breakdown_modalidade jsonb,
  breakdown_esfera jsonb,
  breakdown_segmento jsonb,
  destaque_segmento text,
  destaque_variacao numeric(6,2),
  dados_parciais boolean,
  gerado_por uuid,
  gerado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.indice_startgi_historico TO authenticated;
GRANT ALL ON public.indice_startgi_historico TO service_role;
ALTER TABLE public.indice_startgi_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins leem histórico do índice"
  ON public.indice_startgi_historico FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'admin_central') OR public.has_role(auth.uid(),'admin_empresa'));

CREATE INDEX IF NOT EXISTS idx_indice_startgi_hist_mes ON public.indice_startgi_historico(mes_referencia, gerado_em DESC);

-- Trigger: cada UPSERT em indice_startgi_mensal grava uma linha de histórico
CREATE OR REPLACE FUNCTION public.indice_startgi_log_historico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.indice_startgi_historico (
    mes_referencia, indice_startgi, valor_total_brl, volume_contratos,
    variacao_mom, variacao_yoy, breakdown_modalidade, breakdown_esfera, breakdown_segmento,
    destaque_segmento, destaque_variacao, dados_parciais, gerado_por
  ) VALUES (
    NEW.mes_referencia, NEW.indice_startgi, NEW.valor_total_brl, NEW.volume_contratos,
    NEW.variacao_mom, NEW.variacao_yoy, NEW.breakdown_modalidade, NEW.breakdown_esfera, NEW.breakdown_segmento,
    NEW.destaque_segmento, NEW.destaque_variacao, NEW.dados_parciais, auth.uid()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_indice_startgi_historico ON public.indice_startgi_mensal;
CREATE TRIGGER trg_indice_startgi_historico
AFTER INSERT OR UPDATE ON public.indice_startgi_mensal
FOR EACH ROW EXECUTE FUNCTION public.indice_startgi_log_historico();

-- RPC para listar o histórico (mais recentes primeiro)
CREATE OR REPLACE FUNCTION public.list_indice_startgi_historico(p_limit int DEFAULT 200)
RETURNS SETOF public.indice_startgi_historico
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.indice_startgi_historico
  ORDER BY gerado_em DESC
  LIMIT GREATEST(1, LEAST(p_limit, 1000));
$$;
