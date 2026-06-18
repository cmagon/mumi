-- ============================================================
-- MUMI AMAZONIA — Migration v32 (idempotente)
-- Guarda los baches exactos planificados al crear la orden por
-- "cantidad de ingrediente disponible", para que la preparación
-- use exactamente esa cantidad (sin desajustes por redondeo).
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS baches_plan numeric;
