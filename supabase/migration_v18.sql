-- ============================================================
-- MUMI AMAZONIA — Migration v18 (idempotente)
-- Parámetros de calidad (fisicoquímicos, reológicos, nutricionales) en las fichas
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE products_costing ADD COLUMN IF NOT EXISTS parametros_calidad jsonb DEFAULT '[]'::jsonb;
