-- v90 — Reserva/liberación/consumo de lotes PEPS en SQL (atómico).
-- Antes estas operaciones se hacían con varias escrituras desde el navegador: si se caía la red
-- o se cerraba la pestaña a mitad, la reserva quedaba incompleta o se perdía. Con funciones SQL
-- todo ocurre en UNA transacción en la base de datos: o se hace completo, o no se hace nada.

-- RESERVA aplicando PEPS (con FOR UPDATE: bloquea las filas para evitar carreras entre usuarios).
-- Devuelve { reservados: [{id, lote, vencimiento, cantidad}], faltante }.
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
    v_out := v_out || jsonb_build_array(jsonb_build_object('id', l.id, 'lote', l.lote, 'vencimiento', l.vencimiento, 'cantidad', v_toma));
    v_rest := v_rest - v_toma;
  end loop;
  return jsonb_build_object('reservados', v_out, 'faltante', greatest(v_rest, 0));
end;
$$;

-- LIBERA reservas (orden eliminada/no ejecutada): reservado → disponible.
-- p_reservas: [{id, cantidad}, ...]
create or replace function liberar_reserva_lotes(p_reservas jsonb)
returns void
language plpgsql
as $$
declare
  r jsonb;
begin
  for r in select * from jsonb_array_elements(coalesce(p_reservas, '[]'::jsonb))
  loop
    continue when (r->>'id') is null;
    update raw_material_lots
      set cantidad_actual = coalesce(cantidad_actual, 0) + coalesce((r->>'cantidad')::numeric, 0),
          cantidad_reservada = greatest(0, coalesce(cantidad_reservada, 0) - coalesce((r->>'cantidad')::numeric, 0))
      where id = (r->>'id')::bigint;
  end loop;
end;
$$;

-- CONSUME definitivo (orden cerrada/enviada): descuenta lo reservado (ya salió de disponible al reservar).
create or replace function consumir_reserva_lotes(p_reservas jsonb)
returns void
language plpgsql
as $$
declare
  r jsonb;
begin
  for r in select * from jsonb_array_elements(coalesce(p_reservas, '[]'::jsonb))
  loop
    continue when (r->>'id') is null;
    update raw_material_lots
      set cantidad_reservada = greatest(0, coalesce(cantidad_reservada, 0) - coalesce((r->>'cantidad')::numeric, 0))
      where id = (r->>'id')::bigint;
  end loop;
end;
$$;
