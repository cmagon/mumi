-- v45: PEPS sincronizado con el ciclo de la orden de producción
--   cantidad_reservada: parte del lote comprometida por una orden en proceso (sale de "disponible")
--   lotes_reservados (en la orden): qué lotes y cuánto se reservó, para liberar o consumir luego
alter table raw_material_lots add column if not exists cantidad_reservada numeric default 0;
alter table production_orders add column if not exists lotes_reservados jsonb;
