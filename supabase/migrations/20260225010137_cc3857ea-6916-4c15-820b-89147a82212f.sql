
-- Oportunidades (resultado do matching IA por empresa)
CREATE TABLE public.oportunidades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  licitacao_id UUID NOT NULL REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES public.empresas_clientes(id) ON DELETE CASCADE,
  score_aderencia INTEGER NOT NULL DEFAULT 0 CHECK (score_aderencia >= 0 AND score_aderencia <= 100),
  justificativa_tecnica TEXT,
  nivel_risco TEXT,
  tipo_oportunidade TEXT,
  motivo_recomendacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(licitacao_id, empresa_id)
);

ALTER TABLE public.oportunidades ENABLE ROW LEVEL SECURITY;

-- Admin central can see all
CREATE POLICY "Admin central can read all oportunidades"
  ON public.oportunidades FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin_central'));

-- Users can see oportunidades for their empresa
CREATE POLICY "Users can read own empresa oportunidades"
  ON public.oportunidades FOR SELECT TO authenticated
  USING (
    empresa_id IN (SELECT empresa_id FROM public.user_roles WHERE user_id = auth.uid())
  );

-- Indexes
CREATE INDEX idx_oportunidades_empresa ON public.oportunidades(empresa_id);
CREATE INDEX idx_oportunidades_score ON public.oportunidades(score_aderencia DESC);
CREATE INDEX idx_oportunidades_licitacao ON public.oportunidades(licitacao_id);

CREATE TRIGGER update_oportunidades_updated_at
  BEFORE UPDATE ON public.oportunidades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
