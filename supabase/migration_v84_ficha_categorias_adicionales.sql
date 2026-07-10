-- v84 — Fichas de producto:
--  1) categorias: varias categorías/tipos para una misma ficha (sobre todo MP vendibles).
--  2) costos_adicionales: costos extra personalizados (depreciación de máquinas, etc.) que suman al costo final.
-- Ejecutar manualmente en el SQL Editor de Supabase.
alter table products_costing add column if not exists categorias jsonb;
alter table products_costing add column if not exists costos_adicionales jsonb;
