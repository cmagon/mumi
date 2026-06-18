-- ============================================================
-- MUMI AMAZONIA — Migration v35 (idempotente)
-- Guarda los tiempos por subproceso en el registro de producción.
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE production_records ADD COLUMN IF NOT EXISTS subprocesos jsonb;
-- subprocesos: [{ nombre, inicio, fin }]
