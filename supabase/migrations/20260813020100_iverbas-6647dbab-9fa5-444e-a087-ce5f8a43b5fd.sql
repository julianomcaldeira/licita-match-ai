
-- Remove overly permissive insert policy on api_logs (service role bypasses RLS)
DROP POLICY "Service can insert api logs" ON public.api_logs;
