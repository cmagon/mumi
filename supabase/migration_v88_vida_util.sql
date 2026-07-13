-- v88 — Vida útil (shelf life) del producto en la ficha de costeo.
-- Permite precargar automáticamente la fecha de vencimiento al registrar producción.
alter table products_costing add column if not exists vida_util_valor numeric;
alter table products_costing add column if not exists vida_util_unidad text check (vida_util_unidad in ('dias','meses'));
