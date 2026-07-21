-- v126 — Costo real PEPS en los movimientos y en las reservas de lote.
--
-- Antes: los lotes guardaban `costo_unitario` pero ese dato se descartaba al consumir, así que
-- el costo de los materiales salía siempre del promedio ponderado (raw_materials.precio) y los
-- "registros PEPS" solo servían para trazabilidad, no para valoración.
-- Ahora la reserva devuelve también el costo de cada lote tomado, de modo que cada orden de
-- producción puede valorar su consumo al costo REAL de los lotes que usó.

-- 1) Costo del movimiento de inventario (antes solo vivía dentro del jsonb `extra`)
alter table inventory_movements add column if not exists costo_unitario numeric;
comment on column inventory_movements.costo_unitario is
  'Entrada: costo de compra/fabricación. Salida: costo PEPS ponderado de los lotes consumidos.';

-- Backfill desde el jsonb `extra` para los movimientos ya registrados
update inventory_movements
   set costo_unitario = (extra->>'costo_unitario_real')::numeric
 where costo_unitario is null
   and extra ? 'costo_unitario_real'
   and (extra->>'costo_unitario_real') ~ '^[0-9.]+$';

-- 2) La reserva PEPS ahora informa el costo unitario de cada lote tomado
create or replace function reservar_peps_lotes(p_mp_id bigint, p_cantidad numeric, p_prefer_lote bigint default null)
returns jsonb
language plpgsql
as $$
declare
  l record;
  v_rest numeric := p_cantidad;
  v_toma numeric;
  v_out jsonb := '[]'::jsonb;
begin
  for l in
    select * from raw_material_lots
    where mp_id = p_mp_id and cantidad_actual > 0
    order by (id = p_prefer_lote) desc nulls last, vencimiento asc nulls last, fecha_entrada asc
    for update
  loop
    exit when v_rest <= 0;
    v_toma := least(l.cantidad_actual, v_rest);
    update raw_material_lots
      set cantidad_actual = cantidad_actual - v_toma,
          cantidad_reservada = coalesce(cantidad_reservada, 0) + v_toma
      where id = l.id;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', l.id, 'lote', l.lote, 'vencimiento', l.vencimiento, 'cantidad', v_toma,
      'costo_unitario', coalesce(l.costo_unitario, 0)
    ));
    v_rest := v_rest - v_toma;
  end loop;
  return jsonb_build_object('reservados', v_out, 'faltante', greatest(v_rest, 0));
end;
$$;
