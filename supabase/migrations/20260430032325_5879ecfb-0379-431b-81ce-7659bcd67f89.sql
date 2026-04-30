-- RPC para listar compras órfãs (com raw_json mas sem licitação parent)
CREATE OR REPLACE FUNCTION public.get_orfaos_dadosabertos(p_limit INT DEFAULT 100)
RETURNS TABLE(compra_key TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '30s'
AS $$
  SELECT DISTINCT pr.payload->>'numeroControlePncpCompra' AS compra_key
  FROM pncp_raw pr
  WHERE pr.tipo = 'contrato'
    AND pr.payload->>'numeroControlePncpCompra' IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM licitacoes l
      WHERE l.numero_controle_pncp = pr.payload->>'numeroControlePncpCompra'
    )
  LIMIT p_limit;
$$;

-- Cron para drenar órfãos: a cada 2 minutos, processa um lote de 100
SELECT cron.schedule(
  'pncp-dadosabertos-cleanup-orfaos',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://eiksdfobghixofsxskke.supabase.co/functions/v1/internal-cron-dispatcher',
    headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpa3NkZm9iZ2hpeG9mc3hza2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NzY0MzcsImV4cCI6MjA4NzU1MjQzN30.30O_CNCvL_WpoL0a40oKILdQyt9cY1ZXPZYw_ogeecc'),
    body := jsonb_build_object('target','ingest-pncp-dadosabertos','payload', jsonb_build_object('mode','cleanup-orfaos','batchSize',100))
  ) AS request_id;
  $$
);