-- v82 — Checklist de "alistar ingredientes" por orden de producción.
-- Guarda qué ingredientes ya fueron pesados/alistados por el operario en el modal de proceso.
-- Formato: objeto JSON { "<indiceIngrediente>": true, ... }
alter table production_orders
  add column if not exists alistado jsonb not null default '{}'::jsonb;
