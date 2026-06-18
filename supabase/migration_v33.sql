-- ============================================================
-- MUMI AMAZONIA — Migration v33 (idempotente)
-- Orden de producción: fecha de inicio de elaboración + tiempos por proceso/subproceso.
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS fecha_inicio date;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS procesos_tiempos jsonb;
-- procesos_tiempos: [{ nombre, inicio, fin }]
