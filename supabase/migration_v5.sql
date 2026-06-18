-- ============================================================
-- MUMI AMAZONIA — Migration v5 (idempotente)
-- Pesos (final y desperdicio) en el registro de producción
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE production_records
  ADD COLUMN IF NOT EXISTS peso_final       NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peso_desperdicio NUMERIC DEFAULT 0;
