-- v177 · Clientes: métricas de compra persistidas (para que se vean automáticamente).
--
-- Las métricas por cliente (total comprado, nº de compras, primera/última compra y desglose
-- por mes) se calculan desde las facturas de Alegra y se GUARDAN aquí. Así la app las muestra
-- al instante al abrir Clientes, sin recalcular, y un cron las mantiene frescas.
--
-- Aplicar en Supabase → SQL Editor (Run).

ALTER TABLE clients ADD COLUMN IF NOT EXISTS compras_total NUMERIC DEFAULT 0;     -- $ facturado acumulado
ALTER TABLE clients ADD COLUMN IF NOT EXISTS compras_num INTEGER DEFAULT 0;       -- nº de facturas
ALTER TABLE clients ADD COLUMN IF NOT EXISTS compra_primera DATE;                 -- primera compra
ALTER TABLE clients ADD COLUMN IF NOT EXISTS compra_ultima DATE;                  -- última compra
ALTER TABLE clients ADD COLUMN IF NOT EXISTS compras_por_mes JSONB DEFAULT '{}'::jsonb;  -- { "2026-01": 450000, ... }
ALTER TABLE clients ADD COLUMN IF NOT EXISTS metricas_sync_at TIMESTAMPTZ;        -- última vez que se recalcularon
