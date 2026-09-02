
-- 8 policies nomeadas "Authenticated can read X" mas criadas sem TO authenticated,
-- ficando efetivamente TO PUBLIC (leitura liberada para anon). Mesmo bug encontrado
-- pelo scanner de seguranca do Lovable no projeto iVerbas original.
ALTER POLICY "Authenticated can read mappings" ON public.api_field_mapping TO authenticated;
ALTER POLICY "Authenticated can read daily validation" ON public.consolidacao_diaria_validacao TO authenticated;
ALTER POLICY "Authenticated can read contracts" ON public.contratos_comprasgov TO authenticated;
ALTER POLICY "Authenticated can read integrity logs" ON public.data_integrity_logs TO authenticated;
ALTER POLICY "Authenticated can read daily execution" ON public.execucao_diaria_empresa TO authenticated;
ALTER POLICY "Authenticated can read unified execution" ON public.execucao_unificada TO authenticated;
ALTER POLICY "Authenticated can read unified budget" ON public.orcamento_unificado TO authenticated;
ALTER POLICY "Authenticated can read processing logs" ON public.processing_logs TO authenticated;
