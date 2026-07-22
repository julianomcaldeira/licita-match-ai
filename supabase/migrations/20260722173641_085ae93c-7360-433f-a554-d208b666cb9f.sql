-- Remove old overload of search_licitacoes without p_itens to avoid PostgREST ambiguity
DROP FUNCTION IF EXISTS public.search_licitacoes(
  text, text, text, text, text, text, text, boolean, boolean, integer, integer, text
);