
REINDEX TABLE public.pncp_raw;
REINDEX TABLE public.licitacao_vencedores;
REINDEX TABLE public.contratos;

DELETE FROM public.ingestao_logs
WHERE COALESCE(data_fim, data_inicio, created_at) < now() - interval '60 days';
