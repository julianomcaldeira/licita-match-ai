
REVOKE EXECUTE ON FUNCTION public.requeue_stalled_gaps(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_gap_result(text, integer, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_gap_results(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gap_classify_status(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.requeue_stalled_gaps(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_gap_result(text, integer, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_gap_results(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.gap_classify_status(text, text) TO service_role;
