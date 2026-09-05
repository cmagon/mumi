-- v162 — Entrada de materia prima ATÓMICA (stock + promedio ponderado en una transacción).
--
-- PROBLEMA (informe #5): al registrar una ENTRADA de MP, el cliente leía stock/precio, calculaba
-- el nuevo promedio ponderado en JS y luego lo escribía. Entre la lectura y la escritura otra
-- entrada de la misma MP podía cambiar stock/precio, y el promedio quedaba mal (carrera).
--
-- SOLUCIÓN: bloquear la fila (FOR UPDATE), calcular el promedio y aplicar stock + precio dentro de
-- la misma transacción. La fórmula es idéntica a la del cliente:
--   stock_previo   = greatest(0, stock)                 (los negativos no cuentan para el promedio)
--   nuevo_prom     = stock_previo + cantidad
--   precio_prom    = nuevo_prom > 0
--                    ? (stock_previo*precio + cantidad*costo) / nuevo_prom
--                    : costo
--   stock_despues  = stock + cantidad                   (el stock real sí puede venir de negativo)
--
-- Devuelve { stock_antes, precio_antes, stock_despues, precio_despues } para el rastro del movimiento.
-- Ejecutar en el SQL Editor de Supabase.

create or replace function entrada_mp_promedio(
  p_mp_id bigint,
  p_cantidad numeric,
  p_costo_unitario numeric
)
returns jsonb
language plpgsql
as $$
declare
  v_stock numeric;
  v_precio numeric;
  v_stock_previo numeric;
  v_nuevo_prom numeric;
  v_precio_prom numeric;
  v_stock_despues numeric;
begin
  select coalesce(stock, 0), coalesce(precio, 0)
    into v_stock, v_precio
    from raw_materials
    where id = p_mp_id
    for update;

  if not found then
    raise exception 'La materia prima % no existe', p_mp_id;
  end if;

  v_stock_previo := greatest(0, v_stock);
  v_nuevo_prom   := v_stock_previo + coalesce(p_cantidad, 0);
  v_precio_prom  := case
                      when v_nuevo_prom > 0
                        then (v_stock_previo * v_precio + coalesce(p_cantidad, 0) * coalesce(p_costo_unitario, 0)) / v_nuevo_prom
                      else coalesce(p_costo_unitario, 0)
                    end;
  v_stock_despues := v_stock + coalesce(p_cantidad, 0);

  update raw_materials
    set stock = v_stock_despues,
        precio = v_precio_prom
    where id = p_mp_id;

  return jsonb_build_object(
    'stock_antes',    v_stock,
    'precio_antes',   v_precio,
    'stock_despues',  v_stock_despues,
    'precio_despues', v_precio_prom
  );
end;
$$;
