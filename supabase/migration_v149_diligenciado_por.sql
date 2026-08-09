-- v149 — Quién(es) diligenciaron el proceso de una orden de producción.
-- JSONB: [{ "nombre": "...", "primera_vez": ISO, "ultima_vez": ISO }, ...]
-- Permite uno o varios participantes (operario asignado + quien ayuda / diligencia con permiso).
alter table production_orders
  add column if not exists diligenciado_por jsonb not null default '[]'::jsonb;

comment on column production_orders.diligenciado_por is
  'Personas que abrieron o cerraron el diligenciamiento del proceso (uno o varios).';
