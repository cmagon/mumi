-- v60: nombre del producto SURTIDO resultante cuando se empaca mezclando dos sabores/lotes.
-- Ej: "Bocadillo Mumi Surt. Seje - Araza". Se autocompleta según el lote con el que se combina.
alter table production_records add column if not exists producto_surtido text;
alter table production_orders add column if not exists producto_surtido text;
