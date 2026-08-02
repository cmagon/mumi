-- v137 — PEPS atómico en salidas manuales + liberación segura + lote_bajas.lote_id correcto.
--
-- PROBLEMAS
-- 1) liberar_reserva_lotes sumaba siempre la cantidad pedida a cantidad_actual aunque el lote
--    ya no tuviera tanta reserva (doble liberación → inflaba el disponible).
-- 2) Las salidas manuales de Inventario (consumirPEPS / consumirLote / baja) hacían
--    read-modify-write desde el navegador: dos salidas a la vez podían pisarse.
-- 3) lote_bajas.lote_id era uuid pero raw_material_lots.id es bigint → el insert de auditoría
--    fallaba en silencio.
--
-- SOLUCIÓN
-- · liberar_reserva_lotes solo libera least(pedido, cantidad_reservada).
-- · consumir_peps_lotes / consumir_lote_especifico / bajar_lote_mp: atómicos con FOR UPDATE.
-- · lote_bajas.lote_id pasa a bigint.


-- ------------------------------------------------------------
-- 1) Liberación segura (no infla stock)
-- ------------------------------------------------------------
create or replace function liberar_reserva_lotes(p_reservas jsonb)
returns void
language plpgsql
as $$
declare
  r jsonb;
  v_pedido numeric;
  v_lib numeric;
begin
  for r in select * from jsonb_array_elements(coalesce(p_reservas, '[]'::jsonb))
  loop
    continue when (r->>'id') is null;
    v_pedido := greatest(0, coalesce((r->>'cantidad')::numeric, 0));
    continue when v_pedido <= 0;
    -- Solo se devuelve a disponible lo que realmente estaba reservado.
    update raw_material_lots
      set cantidad_actual = coalesce(cantidad_actual, 0)
            + least(coalesce(cantidad_reservada, 0), v_pedido),
          cantidad_reservada = coalesce(cantidad_reservada, 0)
            - least(coalesce(cantidad_reservada, 0), v_pedido)
      where id = (r->>'id')::bigint;
  end loop;
end;
$$;


-- ------------------------------------------------------------
-- 2) Consumo PEPS atómico (salidas manuales de Inventario)
--    Baja cantidad_actual (no pasa por reservado). Devuelve
--    { consumidos: [{id, lote, vencimiento, cantidad, costo_unitario}], faltante }.
-- ------------------------------------------------------------
create or replace function consumir_peps_lotes(p_mp_id bigint, p_cantidad numeric)
returns jsonb
language plpgsql
as $$
declare
  l record;
  v_rest numeric := greatest(0, coalesce(p_cantidad, 0));
  v_toma numeric;
  v_out jsonb := '[]'::jsonb;
begin
  if v_rest <= 0 then
    return jsonb_build_object('consumidos', v_out, 'faltante', 0);
  end if;

  for l in
    select * from raw_material_lots
    where mp_id = p_mp_id and cantidad_actual > 0
    order by vencimiento asc nulls last, fecha_entrada asc
    for update
  loop
    exit when v_rest <= 0;
    v_toma := least(l.cantidad_actual, v_rest);
    update raw_material_lots
      set cantidad_actual = cantidad_actual - v_toma
      where id = l.id;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', l.id, 'lote', l.lote, 'vencimiento', l.vencimiento, 'cantidad', v_toma,
      'costo_unitario', coalesce(l.costo_unitario, 0)
    ));
    v_rest := v_rest - v_toma;
  end loop;

  return jsonb_build_object('consumidos', v_out, 'faltante', greatest(v_rest, 0));
end;
$$;


-- ------------------------------------------------------------
-- 3) Consumo atómico de UN lote concreto (salida con lote forzado)
-- ------------------------------------------------------------
create or replace function consumir_lote_especifico(p_lote_id bigint, p_cantidad numeric)
returns jsonb
language plpgsql
as $$
declare
  l record;
  v_pedido numeric := greatest(0, coalesce(p_cantidad, 0));
  v_toma numeric;
begin
  if v_pedido <= 0 then
    return jsonb_build_object('consumidos', '[]'::jsonb, 'faltante', 0);
  end if;

  select * into l from raw_material_lots where id = p_lote_id for update;
  if not found then
    return jsonb_build_object('consumidos', '[]'::jsonb, 'faltante', v_pedido);
  end if;

  v_toma := least(coalesce(l.cantidad_actual, 0), v_pedido);
  if v_toma > 0 then
    update raw_material_lots
      set cantidad_actual = cantidad_actual - v_toma
      where id = l.id;
  end if;

  return jsonb_build_object(
    'consumidos', case when v_toma > 0 then jsonb_build_array(jsonb_build_object(
      'id', l.id, 'lote', l.lote, 'vencimiento', l.vencimiento, 'cantidad', v_toma,
      'costo_unitario', coalesce(l.costo_unitario, 0)
    )) else '[]'::jsonb end,
    'faltante', greatest(v_pedido - v_toma, 0)
  );
end;
$$;


-- ------------------------------------------------------------
-- 4) Baja atómica de lote (descuento lote + stock MP en una transacción)
--    Devuelve { ok, tomado, costo_unitario, lote, vencimiento } o lanza si no hay suficiente.
-- ------------------------------------------------------------
create or replace function bajar_lote_mp(p_lote_id bigint, p_cantidad numeric)
returns jsonb
language plpgsql
as $$
declare
  l record;
  v_pedido numeric := greatest(0, coalesce(p_cantidad, 0));
begin
  if v_pedido <= 0 then
    raise exception 'La cantidad a dar de baja debe ser mayor que cero';
  end if;

  select * into l from raw_material_lots where id = p_lote_id for update;
  if not found then
    raise exception 'El lote no existe';
  end if;

  if coalesce(l.cantidad_actual, 0) + 0.0001 < v_pedido then
    raise exception 'No hay suficiente disponible en el lote (disponible: %)', coalesce(l.cantidad_actual, 0);
  end if;

  update raw_material_lots
    set cantidad_actual = cantidad_actual - v_pedido
    where id = l.id;

  -- Stock general de la MP (misma unidad que el lote)
  perform ajustar_stock_mp(l.mp_id, -v_pedido);

  return jsonb_build_object(
    'ok', true,
    'mp_id', l.mp_id,
    'tomado', v_pedido,
    'costo_unitario', coalesce(l.costo_unitario, 0),
    'lote', l.lote,
    'vencimiento', l.vencimiento
  );
end;
$$;


-- ------------------------------------------------------------
-- 5) lote_bajas.lote_id: uuid → bigint (alineado con raw_material_lots.id)
-- ------------------------------------------------------------
alter table if exists lote_bajas drop column if exists lote_id;
alter table if exists lote_bajas add column if not exists lote_id bigint;
comment on column lote_bajas.lote_id is
  'raw_material_lots.id (bigint). Puede quedar huérfano si el lote se borra después.';
