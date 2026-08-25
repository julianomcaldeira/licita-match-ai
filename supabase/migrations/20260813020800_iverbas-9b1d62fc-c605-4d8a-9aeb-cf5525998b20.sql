
-- Tabela principal de contratos coletados do PNCP
CREATE TABLE public.contratos_comprasgov (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cnpj_fornecedor TEXT NOT NULL,
  nome_fornecedor TEXT NOT NULL,
  valor NUMERIC NOT NULL DEFAULT 0,
  objeto TEXT,
  uf TEXT,
  categoria TEXT,
  orgao TEXT,
  data_assinatura DATE,
  ano INTEGER NOT NULL,
  trimestre INTEGER,
  numero_controle_pncp TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_contratos_cnpj ON public.contratos_comprasgov (cnpj_fornecedor);
CREATE INDEX idx_contratos_categoria ON public.contratos_comprasgov (categoria);
CREATE INDEX idx_contratos_ano ON public.contratos_comprasgov (ano);
CREATE INDEX idx_contratos_orgao ON public.contratos_comprasgov (orgao);

-- RLS
ALTER TABLE public.contratos_comprasgov ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read contracts"
ON public.contratos_comprasgov
FOR SELECT
USING (true);

-- Trigger updated_at
CREATE TRIGGER update_contratos_comprasgov_updated_at
BEFORE UPDATE ON public.contratos_comprasgov
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
