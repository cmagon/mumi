-- v62: costo unitario (MP + mano de obra) del producto terminado, sincronizado desde la ficha
-- y empujado a Alegra como unitCost.
alter table finished_products add column if not exists costo_unitario numeric not null default 0;

-- Bootstrap del costo desde las fichas base (MP+empaque ya está en costo_variable;
-- la MO/overhead es costo_final - costo_variable). costo_final ya es el costo total por unidad.
update finished_products fp
set costo_unitario = coalesce(pc.costo_final, 0)
from products_costing pc
where fp.product_id = pc.id and fp.costo_unitario = 0;
