-- v46: permitir forzar el consumo de MP de una orden SIN descontar de lotes específicos
--   (se registra como salida sin lote; solo afecta el stock total)
alter table production_orders add column if not exists forzar_sin_lote boolean default false;
