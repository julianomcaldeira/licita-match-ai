DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.reconcile_gap_queue(5000);
  INSERT INTO public.ingestao_logs (fonte, endpoint, status, registros_processados, detalhes)
  VALUES ('debug','reconcile_gap_queue','sucesso', r.reconciled,
          jsonb_build_object('scanned', r.scanned, 'reconciled', r.reconciled));
END $$;