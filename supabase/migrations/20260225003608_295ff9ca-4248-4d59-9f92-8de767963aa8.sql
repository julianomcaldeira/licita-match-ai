
-- Remove overly permissive policies and restrict writes to service_role only
DROP POLICY "Service role can manage licitacoes" ON public.licitacoes;
DROP POLICY "Service role can manage licitacao_itens" ON public.licitacao_itens;
DROP POLICY "Service role can manage licitacao_vencedores" ON public.licitacao_vencedores;
DROP POLICY "Service role can manage ingestao_logs" ON public.ingestao_logs;

-- No insert/update/delete policies for anon/authenticated = only service_role can write
