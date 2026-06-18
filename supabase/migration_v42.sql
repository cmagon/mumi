-- ============================================================
-- MUMI AMAZONIA — Migration v42 (idempotente)
-- Marca de "prueba" para órdenes de producción (recetas rápidas).
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS es_prueba boolean DEFAULT false;
