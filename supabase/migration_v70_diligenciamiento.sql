-- v70: campos para el diligenciamiento de órdenes (cantidad surtida, sobrante con check).
alter table production_orders add column if not exists surtido_cantidad numeric;   -- unidades/cajas empacadas surtidas (stock terminado)
alter table production_orders add column if not exists hay_sobrante boolean not null default false;
alter table production_orders add column if not exists sobrante_peso numeric;
alter table production_orders add column if not exists sobrante_unidad text;
