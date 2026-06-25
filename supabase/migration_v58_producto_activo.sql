-- v58: estado activo/inactivo de las fichas de producto.
-- Los productos inactivos NO participan en la distribución del CIF de los demás.
alter table products_costing add column if not exists activo boolean not null default true;
