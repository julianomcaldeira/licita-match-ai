
CREATE INDEX IF NOT EXISTS idx_execucao_unificada_ano ON public.execucao_unificada (ano);
CREATE INDEX IF NOT EXISTS idx_execucao_unificada_ano_pago ON public.execucao_unificada (ano, pago_total DESC);
CREATE INDEX IF NOT EXISTS idx_iscores_ano_valor ON public.iscores (ano, valor DESC);
CREATE INDEX IF NOT EXISTS idx_concentration_ano_hhi ON public.concentration_analysis (ano, hhi_index DESC);
CREATE INDEX IF NOT EXISTS idx_orcamento_unificado_ano ON public.orcamento_unificado (ano);
CREATE INDEX IF NOT EXISTS idx_emendas_parl_ano ON public.emendas_parlamentares (ano);
CREATE INDEX IF NOT EXISTS idx_emendas_parl_ano_empenhado ON public.emendas_parlamentares (ano, valor_empenhado DESC);
CREATE INDEX IF NOT EXISTS idx_emendas_docs_ano ON public.emendas_documentos (ano);
CREATE INDEX IF NOT EXISTS idx_emendas_docs_codigo ON public.emendas_documentos (codigo_emenda);
CREATE INDEX IF NOT EXISTS idx_contratos_ano_valor ON public.contratos_comprasgov (ano, valor DESC);
CREATE INDEX IF NOT EXISTS idx_contratos_ano_cnpj ON public.contratos_comprasgov (ano, cnpj_fornecedor);
CREATE INDEX IF NOT EXISTS idx_contratos_ano_orgao ON public.contratos_comprasgov (ano, orgao);
CREATE INDEX IF NOT EXISTS idx_execucao_despesa_ano_orgao ON public.execucao_despesa (ano, orgao);

ANALYZE public.contratos_comprasgov;
ANALYZE public.execucao_unificada;
ANALYZE public.iscores;
ANALYZE public.concentration_analysis;
ANALYZE public.emendas_parlamentares;
ANALYZE public.emendas_documentos;
ANALYZE public.orcamento_unificado;
ANALYZE public.execucao_despesa;
