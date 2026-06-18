-- ============================================================
-- MUMI AMAZONIA — Migration v21 (idempotente)
-- Costo Variable Unitario (modelo de margen de contribución)
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE products_costing ADD COLUMN IF NOT EXISTS costo_variable numeric DEFAULT 0;
