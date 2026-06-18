-- ============================================================
-- MUMI AMAZONIA — Migration v19 (idempotente)
-- Presentación y campos personalizados del producto + parámetros de calidad en recetas
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- Fichas de costos (productos)
ALTER TABLE products_costing ADD COLUMN IF NOT EXISTS presentacion         text DEFAULT 'Unidad';
ALTER TABLE products_costing ADD COLUMN IF NOT EXISTS campos_personalizados jsonb DEFAULT '[]'::jsonb;

-- Recetas rápidas (mismos parámetros de calidad que las fichas)
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS parametros_calidad jsonb DEFAULT '[]'::jsonb;
