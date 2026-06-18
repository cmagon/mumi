-- ============================================================
-- MUMI AMAZONIA — Migration v29 (idempotente)
-- Trazabilidad lote-a-lote: qué lotes de MP se consumieron en cada orden.
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS lotes_mp jsonb;
-- Estructura: [{ mp_id, nombre, unidad, consumo, lotes: [{lote, vencimiento, cantidad}] }]
