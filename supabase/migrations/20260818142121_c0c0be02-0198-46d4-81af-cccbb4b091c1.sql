REVOKE ALL ON FUNCTION public.reconcile_gap_queue(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_gap_queue(integer) TO service_role, postgres;