-- v67: materias primas vendibles (se pueden vender como producto terminado, opcional).
alter table raw_materials add column if not exists vendible boolean not null default false;
alter table raw_materials add column if not exists precio_venta numeric not null default 0;
-- Enlace del producto terminado a la MP de origen (cuando se vende una MP)
alter table finished_products add column if not exists mp_id bigint;
