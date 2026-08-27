DO $reindex$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'licitacoes_pkey' AND relkind = 'i') THEN
    EXECUTE 'REINDEX INDEX public.licitacoes_pkey';
  END IF;
END $reindex$;