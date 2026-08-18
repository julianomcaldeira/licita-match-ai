DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.reconcile_gap_queue(5000);
  RAISE NOTICE 'reconcile teste: scanned=% reconciled=%', r.scanned, r.reconciled;
END $$;