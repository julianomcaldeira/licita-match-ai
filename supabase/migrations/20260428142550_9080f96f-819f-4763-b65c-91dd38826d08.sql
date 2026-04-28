
-- Tabela para rastrear jobs de ingestão manual em background
CREATE TABLE IF NOT EXISTS public.ingestion_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | running | completed | failed | cancelled
  current_phase TEXT, -- 'pncp' | 'winners' | 'contratos' | 'sancionados' | 'auto_analysis'
  phases_total INTEGER NOT NULL DEFAULT 5,
  phases_completed INTEGER NOT NULL DEFAULT 0,
  phase_progress_current INTEGER NOT NULL DEFAULT 0,
  phase_progress_total INTEGER NOT NULL DEFAULT 0,
  phase_label TEXT,
  total_records_processed INTEGER NOT NULL DEFAULT 0,
  state JSONB NOT NULL DEFAULT '{}'::jsonb, -- estado interno: chunk atual, modalidade, página etc.
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE,
  last_tick_at TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ingestion_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin central can read ingestion_jobs"
ON public.ingestion_jobs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin_central'::app_role));

CREATE POLICY "Service role manages ingestion_jobs"
ON public.ingestion_jobs FOR ALL
TO service_role
USING (true) WITH CHECK (true);

CREATE TRIGGER update_ingestion_jobs_updated_at
BEFORE UPDATE ON public.ingestion_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_ingestion_jobs_status ON public.ingestion_jobs(status, created_at DESC);

-- Garantir no máximo 1 job em execução simultaneamente
CREATE UNIQUE INDEX idx_ingestion_jobs_one_running
ON public.ingestion_jobs(status)
WHERE status IN ('pending','running');
