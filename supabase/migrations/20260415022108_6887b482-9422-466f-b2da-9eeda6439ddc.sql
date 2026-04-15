
CREATE TABLE public.api_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name text NOT NULL,
  api_key text NOT NULL DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_api_keys_key ON public.api_keys (api_key);
CREATE INDEX idx_api_keys_active ON public.api_keys (is_active) WHERE is_active = true;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin central can manage api_keys"
  ON public.api_keys FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin_central'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_central'));

CREATE TRIGGER update_api_keys_updated_at
  BEFORE UPDATE ON public.api_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
