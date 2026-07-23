
-- ============ planos ============
CREATE TABLE public.planos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text UNIQUE NOT NULL,
  nome text NOT NULL,
  preco_centavos int NOT NULL DEFAULT 0,
  ciclo text NOT NULL DEFAULT 'mensal',
  max_cnpjs int NOT NULL,
  max_usuarios int NOT NULL,
  creditos_ia_mes numeric NOT NULL DEFAULT 0,
  features text[] NOT NULL DEFAULT '{}',
  self_service boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.planos TO authenticated, anon;
GRANT ALL ON public.planos TO service_role;
ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "planos leitura" ON public.planos FOR SELECT USING (true);
CREATE POLICY "planos admin" ON public.planos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_central'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_central'));

INSERT INTO public.planos (codigo, nome, self_service, max_cnpjs, max_usuarios, creditos_ia_mes, features) VALUES
  ('inteligencia','Inteligência', true, 5, 5, 1000,
    ARRAY['vitorias','dinheiro_na_mesa','concorrentes','sancionadas','radar_diario']),
  ('execucao','Execução', false, 20, 15, 5000,
    ARRAY['vitorias','dinheiro_na_mesa','concorrentes','sancionadas','radar_diario','empenhos','score_pagamento','janela_recompra','api']),
  ('canal','Canal', false, 999, 999, 20000,
    ARRAY['vitorias','dinheiro_na_mesa','concorrentes','sancionadas','radar_diario','empenhos','score_pagamento','janela_recompra','api','white_label','multi_cliente']);

-- ============ assinaturas ============
CREATE TABLE public.assinaturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_cliente_id uuid NOT NULL REFERENCES public.empresas_clientes(id) ON DELETE CASCADE,
  plano_id uuid NOT NULL REFERENCES public.planos(id),
  status text NOT NULL,
  inicio timestamptz NOT NULL DEFAULT now(),
  fim_periodo_atual timestamptz,
  cancelar_em timestamptz,
  provedor text,
  provedor_assinatura_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX assinaturas_empresa_ativa_uniq
  ON public.assinaturas(empresa_cliente_id)
  WHERE status IN ('trial','ativa','inadimplente');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assinaturas TO authenticated;
GRANT ALL ON public.assinaturas TO service_role;
ALTER TABLE public.assinaturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assinaturas admin" ON public.assinaturas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_central'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_central'));

-- ============ creditos_movimentos ============
CREATE TABLE public.creditos_movimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_cliente_id uuid NOT NULL,
  tipo text NOT NULL,
  creditos numeric NOT NULL,
  referencia text,
  metadados jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX creditos_movimentos_empresa_created_idx
  ON public.creditos_movimentos(empresa_cliente_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creditos_movimentos TO authenticated;
GRANT ALL ON public.creditos_movimentos TO service_role;
ALTER TABLE public.creditos_movimentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "creditos admin" ON public.creditos_movimentos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_central'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_central'));

-- ============ cliente_participacoes ============
CREATE TABLE public.cliente_participacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_cliente_id uuid NOT NULL,
  licitacao_id uuid NOT NULL,
  proposta_centavos bigint,
  resultado text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_cliente_id, licitacao_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_participacoes TO authenticated;
GRANT ALL ON public.cliente_participacoes TO service_role;
ALTER TABLE public.cliente_participacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participacoes admin" ON public.cliente_participacoes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_central'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_central'));

-- ============ cliente_exclusoes ============
CREATE TABLE public.cliente_exclusoes (
  empresa_cliente_id uuid NOT NULL,
  licitacao_id uuid NOT NULL,
  motivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_cliente_id, licitacao_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_exclusoes TO authenticated;
GRANT ALL ON public.cliente_exclusoes TO service_role;
ALTER TABLE public.cliente_exclusoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exclusoes admin" ON public.cliente_exclusoes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_central'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_central'));

-- ============ uso_eventos ============
CREATE TABLE public.uso_eventos (
  id bigserial PRIMARY KEY,
  empresa_cliente_id uuid,
  user_id uuid,
  evento text NOT NULL,
  contexto jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX uso_eventos_empresa_created_idx
  ON public.uso_eventos(empresa_cliente_id, created_at DESC);
GRANT SELECT, INSERT ON public.uso_eventos TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.uso_eventos_id_seq TO authenticated;
GRANT ALL ON public.uso_eventos TO service_role;
GRANT ALL ON SEQUENCE public.uso_eventos_id_seq TO service_role;
ALTER TABLE public.uso_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uso_eventos admin" ON public.uso_eventos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_central'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_central'));

-- updated_at triggers
CREATE TRIGGER planos_set_updated BEFORE UPDATE ON public.planos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER assinaturas_set_updated BEFORE UPDATE ON public.assinaturas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
