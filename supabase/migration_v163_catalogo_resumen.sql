-- v163 — Resumen corto de la descripción del catálogo (generado con IA o escrito a mano)

alter table finished_products
  add column if not exists catalogo_resumen text;

comment on column finished_products.catalogo_resumen is
  'Resumen breve de la descripción del catálogo (1–2 frases). Editable; se puede generar con IA.';
