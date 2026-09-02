
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE OR REPLACE FUNCTION public.get_sync_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'sync_secret'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_sync_secret() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_sync_secret() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sync_secret() TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_sync_secret(_value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  existing_id uuid;
BEGIN
  SELECT id INTO existing_id FROM vault.secrets WHERE name = 'sync_secret';
  IF existing_id IS NULL THEN
    PERFORM vault.create_secret(_value, 'sync_secret', 'Shared secret used by pg_cron to call sync edge functions');
  ELSE
    PERFORM vault.update_secret(existing_id, _value);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_sync_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_sync_secret(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_sync_secret(text) TO service_role;

DO $outer$
DECLARE
  anon_jwt text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlydnVmb2hhaXN0c2JkZmRndnprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMDYzMjQsImV4cCI6MjA4Njc4MjMyNH0.QB1ul6g9kc8l1NEl0bUPjsjN64LJyWyYU26GeNqKxrA';
  base_url text := 'https://irvufohaistsbdfdgvzk.supabase.co/functions/v1';
  org_code text;
  org_codes text[] := ARRAY['26000','36000','52000','39000','24000','44000','22000','38000','20000','25000'];
  org_time int := 30;
  headers_expr text;
BEGIN
  PERFORM cron.unschedule(jobname)
  FROM cron.job
  WHERE jobname IN (
    'sync-org-26000','sync-org-36000','sync-org-52000','sync-org-39000','sync-org-24000',
    'sync-org-44000','sync-org-22000','sync-org-38000','sync-org-20000','sync-org-25000',
    'comprasgov-collector-morning','comprasgov-collector-afternoon',
    'sync-emendas-daily','sync-emendas-historico-semanal','enrich-emendas-orgaos-hourly'
  );

  headers_expr := 'jsonb_build_object(''Content-Type'',''application/json'',''apikey'',''' || anon_jwt || ''',''Authorization'',''Bearer ' || anon_jwt || ''',''x-sync-secret'',public.get_sync_secret())';

  FOREACH org_code IN ARRAY org_codes LOOP
    PERFORM cron.schedule(
      'sync-org-' || org_code,
      org_time || ' 1 * * *',
      'SELECT net.http_post(url:=''' || base_url || '/sync-transparencia'', headers:=' || headers_expr ||
      ', body:=jsonb_build_object(''ano'', extract(year from now())::int, ''syncType'',''all'',''codigoOrgao'',''' || org_code || ''')) AS request_id;'
    );
    org_time := org_time + 2;
  END LOOP;

  PERFORM cron.schedule(
    'comprasgov-collector-morning', '0 6 * * *',
    'SELECT net.http_post(url:=''' || base_url || '/comprasgov-collector'', headers:=' || headers_expr ||
    ', body:=''{"time":"morning"}''::jsonb) AS request_id;'
  );

  PERFORM cron.schedule(
    'comprasgov-collector-afternoon', '0 17 * * *',
    'SELECT net.http_post(url:=''' || base_url || '/comprasgov-collector'', headers:=' || headers_expr ||
    ', body:=''{"time":"afternoon"}''::jsonb) AS request_id;'
  );

  PERFORM cron.schedule(
    'sync-emendas-daily', '30 3 * * *',
    'SELECT net.http_post(url:=''' || base_url || '/sync-emendas'', headers:=' || headers_expr ||
    ', body:=jsonb_build_object(''ano'', extract(year from now())::int)) AS request_id;'
  );

  PERFORM cron.schedule(
    'sync-emendas-historico-semanal', '0 2 * * 0',
    'SELECT net.http_post(url:=''' || base_url || '/sync-emendas'', headers:=' || headers_expr ||
    ', body:=jsonb_build_object(''ano'', (extract(year from now())::int - ((extract(doy from now())::int) % 5)))) AS request_id;'
  );

  PERFORM cron.schedule(
    'enrich-emendas-orgaos-hourly', '0 4-10 * * *',
    'SELECT net.http_post(url:=''' || base_url || '/enrich-emendas-orgaos'', headers:=' || headers_expr ||
    ', body:=jsonb_build_object(''ano'', extract(year from now())::int, ''listLimit'', 120, ''detailLimit'', 300)) AS request_id;'
  );
END $outer$;
