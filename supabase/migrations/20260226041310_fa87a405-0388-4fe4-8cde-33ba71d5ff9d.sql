
-- Table to track incremental sync state per modalidade
CREATE TABLE public.sync_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_source TEXT NOT NULL DEFAULT 'pncp',
  modalidade INTEGER NOT NULL,
  last_date_processed TEXT NOT NULL, -- format YYYYMMDD
  total_synced INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(api_source, modalidade)
);

-- Enable RLS
ALTER TABLE public.sync_status ENABLE ROW LEVEL SECURITY;

-- Only service role can write, authenticated users can read
CREATE POLICY "Authenticated users can view sync status"
  ON public.sync_status FOR SELECT
  USING (auth.role() = 'authenticated');
