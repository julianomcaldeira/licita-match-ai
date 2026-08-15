REVOKE ALL ON FUNCTION public.ingestao_rotas_resumo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ingestao_rotas_resumo() TO authenticated;