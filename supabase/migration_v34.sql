-- ============================================================
-- MUMI AMAZONIA — Migration v34 (idempotente)
-- Resultado de producción capturado en la orden (peso final / desperdicio).
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS peso_final numeric;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS peso_desperdicio numeric;
