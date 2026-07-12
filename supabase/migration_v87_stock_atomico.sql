-- v87 — Ajuste atómico de stock de materia prima (raw_materials.stock).
-- Antes, cada movimiento (entrada/salida/ajuste, reserva/liberación/consumo de MP en órdenes,
-- descuento de empaque, entrada de subproducto) leía el stock actual desde el cliente, sumaba/restaba
-- en JS y volvía a escribirlo. Si dos operaciones ocurrían casi al mismo tiempo (dos pestañas, o una
-- salida de inventario mientras se reserva una orden), la segunda escritura podía pisar el efecto de
-- la primera y perder unidades contabilizadas. Esta función hace el ajuste dentro de la base de datos
-- en una sola sentencia (UPDATE ... SET stock = stock + delta), evitando esa condición de carrera.
-- Ejecutar manualmente en el SQL Editor de Supabase.
create or replace function ajustar_stock_mp(p_mp_id bigint, p_delta numeric)
returns numeric
language plpgsql
as $$
declare
  v_nuevo numeric;
begin
  update raw_materials set stock = coalesce(stock, 0) + p_delta where id = p_mp_id
  returning stock into v_nuevo;
  return v_nuevo;
end;
$$;
