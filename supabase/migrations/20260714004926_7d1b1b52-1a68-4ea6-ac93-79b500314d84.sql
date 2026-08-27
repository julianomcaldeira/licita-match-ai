
DO $reindex$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_licitacoes_orgao_trgm' AND relkind = 'i') THEN
    EXECUTE 'REINDEX INDEX public.idx_licitacoes_orgao_trgm';
  END IF;
END $reindex$;
DO $reindex$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_licitacoes_date_valor' AND relkind = 'i') THEN
    EXECUTE 'REINDEX INDEX public.idx_licitacoes_date_valor';
  END IF;
END $reindex$;
DO $reindex$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_licitacoes_date_valor_full' AND relkind = 'i') THEN
    EXECUTE 'REINDEX INDEX public.idx_licitacoes_date_valor_full';
  END IF;
END $reindex$;
DO $reindex$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_licitacoes_valor_homologado_desc' AND relkind = 'i') THEN
    EXECUTE 'REINDEX INDEX public.idx_licitacoes_valor_homologado_desc';
  END IF;
END $reindex$;
DO $reindex$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_licitacoes_numero_controle' AND relkind = 'i') THEN
    EXECUTE 'REINDEX INDEX public.idx_licitacoes_numero_controle';
  END IF;
END $reindex$;
DO $reindex$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_licitacoes_data_pub_desc' AND relkind = 'i') THEN
    EXECUTE 'REINDEX INDEX public.idx_licitacoes_data_pub_desc';
  END IF;
END $reindex$;
DO $reindex$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_licitacoes_situacao_data' AND relkind = 'i') THEN
    EXECUTE 'REINDEX INDEX public.idx_licitacoes_situacao_data';
  END IF;
END $reindex$;
DO $reindex$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_licitacoes_situacao' AND relkind = 'i') THEN
    EXECUTE 'REINDEX INDEX public.idx_licitacoes_situacao';
  END IF;
END $reindex$;
DO $reindex$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_licitacoes_fonte' AND relkind = 'i') THEN
    EXECUTE 'REINDEX INDEX public.idx_licitacoes_fonte';
  END IF;
END $reindex$;
DO $reindex$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_licitacoes_orgao' AND relkind = 'i') THEN
    EXECUTE 'REINDEX INDEX public.idx_licitacoes_orgao';
  END IF;
END $reindex$;
DO $reindex$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_licitacoes_uf' AND relkind = 'i') THEN
    EXECUTE 'REINDEX INDEX public.idx_licitacoes_uf';
  END IF;
END $reindex$;
DO $reindex$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_licitacoes_pending_winners_created' AND relkind = 'i') THEN
    EXECUTE 'REINDEX INDEX public.idx_licitacoes_pending_winners_created';
  END IF;
END $reindex$;
