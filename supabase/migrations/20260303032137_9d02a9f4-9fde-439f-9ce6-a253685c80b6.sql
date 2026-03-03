
-- Check and drop any duplicate search_licitacoes signatures
-- The old one likely had different parameter types or ordering
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'search_licitacoes' AND n.nspname = 'public'
  LOOP
    -- Keep only the latest one (with statement_timeout set)
    IF r.args != 'p_search text, p_modalidade text, p_uf text, p_situacao text, p_orgao text, p_date_from text, p_date_to text, p_com_vencedor boolean, p_vencedor text, p_limit integer, p_offset integer' THEN
      EXECUTE format('DROP FUNCTION public.search_licitacoes(%s)', r.args);
    END IF;
  END LOOP;
END;
$$;
