-- v71: opción de dejar las subporciones de un dulce como SALDO (semielaborado), no como stock,
-- hasta que se empaquen (surtido o normal). Resuelve el doble conteo al empacar surtido después.
alter table production_orders add column if not exists subporciones_a_saldo boolean not null default false;
