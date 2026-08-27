DO $reindex$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_licitacoes_objeto_lower_trgm' AND relkind = 'i') THEN
    EXECUTE 'REINDEX INDEX public.idx_licitacoes_objeto_lower_trgm';
  END IF;
END $reindex$;