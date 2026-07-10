-- v85 — Campos adicionales personalizados en la orden de producción (sobre todo para MP vendibles,
-- ej. "Productor", "Finca", "Variedad" en frutas). Se muestran en la impresión y quedan en el detalle.
-- Ejecutar manualmente en el SQL Editor de Supabase.
alter table production_orders add column if not exists campos_extra jsonb;
