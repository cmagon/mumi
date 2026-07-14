-- v91 — Descripción del producto: se captura en la ficha de costeo, viaja al catálogo de
-- Producto Terminado y se sincroniza con el campo "description" del ítem en Alegra.
alter table products_costing add column if not exists descripcion text;
alter table finished_products add column if not exists descripcion text;
