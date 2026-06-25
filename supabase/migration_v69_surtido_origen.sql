-- v69: enlace de un producto SURTIDO a sus dos fichas de origen (sabores combinados).
-- Permite recalcular costo/precios como promedio aunque el surtido tenga un nombre comercial propio.
alter table finished_products add column if not exists surtido_a bigint;   -- products_costing.id sabor 1
alter table finished_products add column if not exists surtido_b bigint;   -- products_costing.id sabor 2
