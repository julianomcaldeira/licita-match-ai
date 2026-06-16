
-- 1) Restrict indice_startgi_mensal writes to admin_central only
DROP POLICY IF EXISTS indice_startgi_admin_write ON public.indice_startgi_mensal;
CREATE POLICY indice_startgi_admin_write ON public.indice_startgi_mensal
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin_central'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin_central'::app_role));

-- 2) api_keys: store SHA-256 hash + short prefix instead of plaintext
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS api_key_hash text;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS api_key_prefix text;

-- Backfill from existing plaintext column (if present)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='api_keys' AND column_name='api_key'
  ) THEN
    UPDATE public.api_keys
       SET api_key_hash = COALESCE(api_key_hash, encode(digest(api_key, 'sha256'), 'hex')),
           api_key_prefix = COALESCE(api_key_prefix, substring(api_key, 1, 8))
     WHERE api_key IS NOT NULL;
  END IF;
END $$;

ALTER TABLE public.api_keys ALTER COLUMN api_key_hash SET NOT NULL;
ALTER TABLE public.api_keys ALTER COLUMN api_key_prefix SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS api_keys_hash_uidx ON public.api_keys(api_key_hash);

-- Drop the plaintext column
ALTER TABLE public.api_keys DROP COLUMN IF EXISTS api_key;
