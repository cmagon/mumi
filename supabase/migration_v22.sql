-- ============================================================
-- MUMI AMAZONIA — Migration v22 (idempotente)
-- Vincular registros de producción con su orden de producción
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE production_records ADD COLUMN IF NOT EXISTS orden_id bigint;
CREATE INDEX IF NOT EXISTS idx_production_records_orden ON production_records (orden_id);
