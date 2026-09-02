
-- sync_state: cursor persistence for progressive collectors
CREATE TABLE public.sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL UNIQUE,
  cursor jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sync_state TO authenticated;
GRANT ALL ON public.sync_state TO service_role;

ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read sync_state"
ON public.sync_state FOR SELECT
TO authenticated
USING (public.iverbas_has_role(auth.uid(), 'admin_central'));

CREATE TRIGGER trg_sync_state_updated_at
BEFORE UPDATE ON public.sync_state
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add PNCP validity date columns to contratos_comprasgov
ALTER TABLE public.contratos_comprasgov
  ADD COLUMN IF NOT EXISTS data_vigencia_inicio date,
  ADD COLUMN IF NOT EXISTS data_vigencia_fim date;
