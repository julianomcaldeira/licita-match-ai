
CREATE TABLE public.emendas_parlamentares (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ano integer NOT NULL,
  codigo_emenda text NOT NULL,
  autor_nome text NOT NULL,
  autor_tipo text,
  autor_uf text,
  partido text,
  orgao_codigo text NOT NULL,
  orgao_nome text NOT NULL,
  funcao text,
  subfuncao text,
  localidade text,
  valor_empenhado numeric NOT NULL DEFAULT 0,
  valor_liquidado numeric NOT NULL DEFAULT 0,
  valor_pago numeric NOT NULL DEFAULT 0,
  valor_restos_pagar numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT emendas_parlamentares_unique UNIQUE (ano, codigo_emenda, orgao_codigo, autor_nome)
);

CREATE INDEX idx_emendas_ano ON public.emendas_parlamentares (ano);
CREATE INDEX idx_emendas_autor ON public.emendas_parlamentares (autor_nome);
CREATE INDEX idx_emendas_orgao ON public.emendas_parlamentares (orgao_codigo);
CREATE INDEX idx_emendas_funcao ON public.emendas_parlamentares (funcao);

GRANT SELECT ON public.emendas_parlamentares TO authenticated;
GRANT ALL ON public.emendas_parlamentares TO service_role;

ALTER TABLE public.emendas_parlamentares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read emendas"
  ON public.emendas_parlamentares
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER update_emendas_updated_at
  BEFORE UPDATE ON public.emendas_parlamentares
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
