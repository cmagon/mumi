-- v127 — Trazabilidad del lote hacia la orden que lo produjo.
--
-- Al DEVOLVER una orden de subproducto, la entrada que sumó a inventario no se podía revertir:
-- el lote creado no tenía forma de identificarse, así que el stock quedaba sumado dos veces si la
-- orden se volvía a cerrar. Con `orden_id` el lote se puede localizar y revertir.
alter table raw_material_lots add column if not exists orden_id bigint;
create index if not exists raw_material_lots_orden_idx on raw_material_lots (orden_id);
comment on column raw_material_lots.orden_id is
  'Orden de producción que generó este lote (subproductos). Permite revertirlo al devolver la orden.';

-- Ajuste ATÓMICO del stock de producto terminado (equivalente a ajustar_stock_mp).
-- Antes se hacía leer-y-escribir desde el navegador: si dos aprobaciones ocurrían a la vez,
-- una sobrescribía a la otra y se perdían unidades.
create or replace function ajustar_stock_finished(p_finished_id uuid, p_delta numeric)
returns numeric
language plpgsql
as $$
declare
  v_nuevo numeric;
begin
  update finished_products
     set stock = coalesce(stock, 0) + p_delta
   where id = p_finished_id
  returning stock into v_nuevo;
  return v_nuevo;
end;
$$;
