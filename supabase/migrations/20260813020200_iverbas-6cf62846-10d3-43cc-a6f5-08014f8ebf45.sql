
-- Add data_empenho column to execucao_despesa
ALTER TABLE public.execucao_despesa ADD COLUMN IF NOT EXISTS data_empenho date;

-- Create indexes for performance (CNPJ, órgão, ano, programa)
CREATE INDEX IF NOT EXISTS idx_execucao_cnpj ON public.execucao_despesa (cnpj_favorecido);
CREATE INDEX IF NOT EXISTS idx_execucao_orgao ON public.execucao_despesa (orgao);
CREATE INDEX IF NOT EXISTS idx_execucao_ano ON public.execucao_despesa (ano);
CREATE INDEX IF NOT EXISTS idx_execucao_programa ON public.execucao_despesa (programa);
CREATE INDEX IF NOT EXISTS idx_execucao_data_pagamento ON public.execucao_despesa (data_pagamento);
CREATE INDEX IF NOT EXISTS idx_execucao_data_empenho ON public.execucao_despesa (data_empenho);

CREATE INDEX IF NOT EXISTS idx_orcamento_orgao ON public.orcamento_anual (orgao);
CREATE INDEX IF NOT EXISTS idx_orcamento_ano ON public.orcamento_anual (ano);
CREATE INDEX IF NOT EXISTS idx_orcamento_programa ON public.orcamento_anual (programa);
