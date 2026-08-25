
-- ═══════════════════════════════════════════════════════════
-- contratos_gestao
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.contratos_gestao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id_externo text NOT NULL UNIQUE,
  numero_contrato text,
  unidade_codigo text,
  unidade_nome text,
  orgao_codigo text,
  orgao_nome text,
  fornecedor_cnpj text,
  fornecedor_nome text,
  objeto text,
  valor_global numeric,
  valor_acumulado numeric,
  vigencia_inicio date,
  vigencia_fim date,
  situacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.contratos_gestao TO authenticated;
GRANT ALL ON public.contratos_gestao TO service_role;

ALTER TABLE public.contratos_gestao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contratos_gestao_read_authenticated"
  ON public.contratos_gestao FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS contratos_gestao_fornecedor_cnpj_idx ON public.contratos_gestao (fornecedor_cnpj);
CREATE INDEX IF NOT EXISTS contratos_gestao_orgao_codigo_idx ON public.contratos_gestao (orgao_codigo);
CREATE INDEX IF NOT EXISTS contratos_gestao_vigencia_fim_idx ON public.contratos_gestao (vigencia_fim);

CREATE TRIGGER contratos_gestao_updated_at
  BEFORE UPDATE ON public.contratos_gestao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════
-- contrato_empenhos
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.contrato_empenhos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id_externo text NOT NULL,
  numero_empenho text NOT NULL,
  unidade_gestora text,
  fornecedor_cnpj text,
  valor_empenhado numeric,
  valor_liquidado numeric,
  valor_pago numeric,
  valor_rp_inscrito numeric,
  data_emissao date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contrato_empenhos_contrato_numero_uk UNIQUE (contrato_id_externo, numero_empenho)
);

GRANT SELECT ON public.contrato_empenhos TO authenticated;
GRANT ALL ON public.contrato_empenhos TO service_role;

ALTER TABLE public.contrato_empenhos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contrato_empenhos_read_authenticated"
  ON public.contrato_empenhos FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS contrato_empenhos_contrato_id_externo_idx ON public.contrato_empenhos (contrato_id_externo);
CREATE INDEX IF NOT EXISTS contrato_empenhos_numero_empenho_idx ON public.contrato_empenhos (numero_empenho);

CREATE TRIGGER contrato_empenhos_updated_at
  BEFORE UPDATE ON public.contrato_empenhos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
