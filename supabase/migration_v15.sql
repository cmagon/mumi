-- ============================================================
-- MUMI AMAZONIA — Migration v15 (idempotente)
-- Porcionado del producto final (subporciones por unidad)
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- Fichas de costos (productos)
ALTER TABLE products_costing ADD COLUMN IF NOT EXISTS porciona        boolean NOT NULL DEFAULT false;
ALTER TABLE products_costing ADD COLUMN IF NOT EXISTS peso_subporcion numeric;

-- Recetas rápidas
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS porciona        boolean NOT NULL DEFAULT false;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS peso_subporcion numeric;
