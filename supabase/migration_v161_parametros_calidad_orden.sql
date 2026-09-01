-- v161 — Resultados de parámetros de calidad en la orden de producción (Brix, acidez, pH…).
-- Se diligencian al cerrar el proceso según la ficha del producto/receta.
-- Ejecutar manualmente en el SQL Editor de Supabase.
alter table production_orders add column if not exists parametros_calidad_resultado jsonb;
