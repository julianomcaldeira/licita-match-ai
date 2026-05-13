CREATE TABLE IF NOT EXISTS public.ai_query_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL,
  question TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  response JSONB NOT NULL,
  model_used TEXT,
  hits INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_query_cache_key ON public.ai_query_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_ai_query_cache_expires ON public.ai_query_cache(expires_at);

ALTER TABLE public.ai_query_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read ai cache"
  ON public.ai_query_cache FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role manages ai cache"
  ON public.ai_query_cache FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Função utilitária para limpar cache expirado (chamada manual ou via cron)
CREATE OR REPLACE FUNCTION public.cleanup_ai_query_cache()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.ai_query_cache WHERE expires_at < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;