-- ============================================================
-- MUMI AMAZONIA — Migration v40 (idempotente)
-- Subporciones en el resultado de producción (solo productos que "se porcionan").
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE production_records ADD COLUMN IF NOT EXISTS peso_subporcion  numeric;
ALTER TABLE production_records ADD COLUMN IF NOT EXISTS cant_subporciones numeric;
ALTER TABLE production_orders  ADD COLUMN IF NOT EXISTS peso_subporcion  numeric;
ALTER TABLE production_orders  ADD COLUMN IF NOT EXISTS cant_subporciones numeric;
