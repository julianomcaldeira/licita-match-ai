-- Create index for fast ordering by valor_homologado DESC with NULLS LAST
CREATE INDEX IF NOT EXISTS idx_licitacoes_valor_homologado_desc 
ON public.licitacoes (valor_homologado DESC NULLS LAST);

-- Create index for date filtering
CREATE INDEX IF NOT EXISTS idx_licitacoes_data_publicacao 
ON public.licitacoes (data_publicacao);

-- Increase statement timeout for authenticated users
ALTER ROLE authenticated SET statement_timeout = '30s';