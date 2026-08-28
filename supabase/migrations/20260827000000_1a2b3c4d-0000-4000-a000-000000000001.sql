-- Performance: índices faltantes para ingestão (observado em IngestaoMonitorPage e ingest-empenhos-federal)
-- empenhos.contrato_id é usado em ingest-empenhos-federal:152 join com contratos, sem índice causava seq scan
CREATE INDEX IF NOT EXISTS idx_empenhos_contrato_id ON public.empenhos(contrato_id);
CREATE INDEX IF NOT EXISTS idx_empenhos_cnpj_orgao_numero ON public.empenhos(cnpj_orgao, numero_empenho);
CREATE INDEX IF NOT EXISTS idx_licitacoes_fonte_numero ON public.licitacoes(fonte, numero_controle_pncp) WHERE fonte = 'PNCP';
-- Para cobertura_resumo: acelerar pncp_gaps_summary
CREATE INDEX IF NOT EXISTS idx_pncp_gap_queue_status_ano ON public.pncp_gap_queue(status, ano) WHERE status = 'pending';
