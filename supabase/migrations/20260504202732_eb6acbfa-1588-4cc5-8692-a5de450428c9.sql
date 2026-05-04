CREATE TABLE IF NOT EXISTS public.orgao_siafi_cache (
  cnpj TEXT PRIMARY KEY,
  codigo_siafi TEXT,
  found BOOLEAN NOT NULL DEFAULT false,
  lookup_count INTEGER NOT NULL DEFAULT 1,
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.orgao_siafi_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read siafi cache"
  ON public.orgao_siafi_cache FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role manages siafi cache"
  ON public.orgao_siafi_cache FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_orgao_siafi_cache_found
  ON public.orgao_siafi_cache(found, last_checked_at);