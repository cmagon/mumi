-- v66: precio detal en terminados + mapeo de listas de precios de Alegra.
alter table finished_products add column if not exists precio_detal numeric not null default 0;
alter table alegra_config add column if not exists price_list_mayor text;   -- idPriceList "por mayor"
alter table alegra_config add column if not exists price_list_detal text;   -- idPriceList "detal / distribuidores"

-- Bootstrap del precio detal desde las fichas base
update finished_products fp
set precio_detal = case when fp.precio_detal = 0 then coalesce(pc.precio_detal, 0) else fp.precio_detal end
from products_costing pc
where fp.product_id = pc.id;
