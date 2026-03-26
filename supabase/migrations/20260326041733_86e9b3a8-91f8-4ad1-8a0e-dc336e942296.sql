
-- Reset backfill progress for modalidades with data gaps
-- These were marked complete but have missing data due to silently skipped errors

-- Dispensa (mod 6): actual data stops at 2026-03-04
UPDATE sync_status SET last_date_processed = '20260304', updated_at = now() 
WHERE api_source = 'pncp-backfill' AND modalidade = 6;

-- Inexigibilidade (mod 7): actual data stops at 2026-03-02
UPDATE sync_status SET last_date_processed = '20260302', updated_at = now() 
WHERE api_source = 'pncp-backfill' AND modalidade = 7;

-- Credenciamento (mod 12): actual data stops at 2026-03-05
UPDATE sync_status SET last_date_processed = '20260305', updated_at = now() 
WHERE api_source = 'pncp-backfill' AND modalidade = 12;

-- Pregão Presencial (mod 8): actual data stops at 2026-03-20  
UPDATE sync_status SET last_date_processed = '20260320', updated_at = now() 
WHERE api_source = 'pncp-backfill' AND modalidade = 8;

-- Also update the 'pncp' source entries stuck at 2023 dates
-- These prevent the cron from working properly for these modalidades
UPDATE sync_status SET last_date_processed = '20260304', updated_at = now() 
WHERE api_source = 'pncp' AND modalidade = 6 AND last_date_processed < '20260101';

UPDATE sync_status SET last_date_processed = '20260302', updated_at = now() 
WHERE api_source = 'pncp' AND modalidade = 7 AND last_date_processed < '20260101';

UPDATE sync_status SET last_date_processed = '20260320', updated_at = now() 
WHERE api_source = 'pncp' AND modalidade = 8 AND last_date_processed < '20260101';

UPDATE sync_status SET last_date_processed = '20260305', updated_at = now() 
WHERE api_source = 'pncp' AND modalidade = 9 AND last_date_processed < '20260101';

UPDATE sync_status SET last_date_processed = '20260305', updated_at = now() 
WHERE api_source = 'pncp' AND modalidade = 10 AND last_date_processed < '20260101';

UPDATE sync_status SET last_date_processed = '20260305', updated_at = now() 
WHERE api_source = 'pncp' AND modalidade = 11 AND last_date_processed < '20260101';

UPDATE sync_status SET last_date_processed = '20260305', updated_at = now() 
WHERE api_source = 'pncp' AND modalidade = 12 AND last_date_processed < '20260101';

UPDATE sync_status SET last_date_processed = '20260305', updated_at = now() 
WHERE api_source = 'pncp' AND modalidade = 13 AND last_date_processed < '20260101';
