-- v65: campos para sincronización completa del producto terminado con Alegra
-- (imagen y precio de venta al por mayor; nombre/costo/stock ya existen).
alter table finished_products add column if not exists imagen_url text;
alter table finished_products add column if not exists precio_mayor numeric not null default 0;

-- Bootstrap desde las fichas base (imagen y precio mayor)
update finished_products fp
set imagen_url = coalesce(fp.imagen_url, pc.imagen_url),
    precio_mayor = case when fp.precio_mayor = 0 then coalesce(pc.precio_mayor, 0) else fp.precio_mayor end
from products_costing pc
where fp.product_id = pc.id;
