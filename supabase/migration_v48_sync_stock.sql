-- ============================================================
-- migration_v48_sync_stock.sql
-- Soporte para la sincronización de stock por polling (alegra-sync-stock).
--   - sync_desde: fecha de corte. Solo se procesan documentos de Alegra con date >= sync_desde.
--     Por defecto = HOY, para que la primera corrida NO reprocese el histórico y descuadre el stock.
-- ============================================================

ALTER TABLE alegra_config ADD COLUMN IF NOT EXISTS sync_desde date;

-- Inicializa el corte a hoy si aún no está definido (solo el registro único id=1).
UPDATE alegra_config SET sync_desde = CURRENT_DATE WHERE id = 1 AND sync_desde IS NULL;
