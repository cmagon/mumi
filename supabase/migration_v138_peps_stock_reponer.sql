-- v138 — PEPS: consumo con stock atómico + reponer/reducir lotes por id.
--
-- 1) consumir_peps_lotes / consumir_lote_especifico aceptan p_ajustar_stock:
--    en salidas de Inventario lote + stock van en la misma transacción.
-- 2) reponer_cantidades_lotes: devuelve cantidad a lotes por id (anular salida / sobró en planta).
-- 3) reducir_lote_mp: baja cantidad_actual de un lote por id (anular entrada).
-- 4) reponer_peps_lotes: repone cantidad a lotes preferidos y luego al más reciente de la MP.


-- ------------------------------------------------------------
-- 1) Consumo PEPS (+ stock opcional)
--    Se elimina la firma de 2 args (v137) para no dejar dos sobrecargas.
-- ------------------------------------------------------------
drop function if exists consumir_peps_lotes(bigint, numeric);

create or replace function consumir_peps_lotes(
  p_mp_id bigint,
  p_cantidad numeric,
  p_ajustar_stock boolean default false
)
returns jsonb
language plpgsql
as $$
declare
  l record;
  v_rest numeric := greatest(0, coalesce(p_cantidad, 0));
  v_toma numeric;
  v_out jsonb := '[]'::jsonb;
  v_pedido numeric := greatest(0, coalesce(p_cantidad, 0));
begin
  if v_rest <= 0 then
    return jsonb_build_object('consumidos', v_out, 'faltante', 0, 'stock_ajustado', false);
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

  -- Misma semántica que Inventario: el stock baja por el pedido completo (aunque falte lote).
  if p_ajustar_stock and v_pedido > 0 then
    perform ajustar_stock_mp(p_mp_id, -v_pedido);
  end if;

  return jsonb_build_object(
    'consumidos', v_out,
    'faltante', greatest(v_rest, 0),
    'stock_ajustado', coalesce(p_ajustar_stock, false)
  );
end;
$$;


-- ------------------------------------------------------------
-- 2) Consumo de un lote concreto (+ stock opcional)
-- ------------------------------------------------------------
drop function if exists consumir_lote_especifico(bigint, numeric);

create or replace function consumir_lote_especifico(
  p_lote_id bigint,
  p_cantidad numeric,
  p_ajustar_stock boolean default false
)
returns jsonb
language plpgsql
as $$
declare
  l record;
  v_pedido numeric := greatest(0, coalesce(p_cantidad, 0));
  v_toma numeric;
begin
  if v_pedido <= 0 then
    return jsonb_build_object('consumidos', '[]'::jsonb, 'faltante', 0, 'stock_ajustado', false);
  end if;

  select * into l from raw_material_lots where id = p_lote_id for update;
  if not found then
    -- Sin lote no podemos ajustar stock aquí (falta mp_id); el cliente lo hace.
    return jsonb_build_object('consumidos', '[]'::jsonb, 'faltante', v_pedido, 'stock_ajustado', false);
  end if;

  v_toma := least(coalesce(l.cantidad_actual, 0), v_pedido);
  if v_toma > 0 then
    update raw_material_lots
      set cantidad_actual = cantidad_actual - v_toma
      where id = l.id;
  end if;

  if p_ajustar_stock then
    perform ajustar_stock_mp(l.mp_id, -v_pedido);
  end if;

  return jsonb_build_object(
    'consumidos', case when v_toma > 0 then jsonb_build_array(jsonb_build_object(
      'id', l.id, 'lote', l.lote, 'vencimiento', l.vencimiento, 'cantidad', v_toma,
      'costo_unitario', coalesce(l.costo_unitario, 0)
    )) else '[]'::jsonb end,
    'faltante', greatest(v_pedido - v_toma, 0),
    'stock_ajustado', coalesce(p_ajustar_stock, false)
  );
end;
$$;


-- ------------------------------------------------------------
-- 3) Reponer cantidades exactas a lotes por id (anular salidas)
-- ------------------------------------------------------------
create or replace function reponer_cantidades_lotes(p_items jsonb)
returns void
language plpgsql
as $$
declare
  r jsonb;
  v_cant numeric;
begin
  for r in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    continue when (r->>'id') is null;
    v_cant := greatest(0, coalesce((r->>'cantidad')::numeric, 0));
    continue when v_cant <= 0;
    update raw_material_lots
      set cantidad_actual = coalesce(cantidad_actual, 0) + v_cant
      where id = (r->>'id')::bigint;
  end loop;
end;
$$;


-- ------------------------------------------------------------
-- 4) Reducir lote por id (anular entradas) — no toca reservado
-- ------------------------------------------------------------
create or replace function reducir_lote_mp(p_lote_id bigint, p_cantidad numeric)
returns jsonb
language plpgsql
as $$
declare
  l record;
  v_pedido numeric := greatest(0, coalesce(p_cantidad, 0));
  v_toma numeric;
begin
  if v_pedido <= 0 then
    return jsonb_build_object('ok', true, 'tomado', 0);
  end if;

  select * into l from raw_material_lots where id = p_lote_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'tomado', 0, 'error', 'lote_no_existe');
  end if;

  v_toma := least(coalesce(l.cantidad_actual, 0), v_pedido);
  if v_toma > 0 then
    update raw_material_lots
      set cantidad_actual = cantidad_actual - v_toma
      where id = l.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'tomado', v_toma,
    'mp_id', l.mp_id,
    'restante_pedido', greatest(v_pedido - v_toma, 0)
  );
end;
$$;


-- ------------------------------------------------------------
-- 5) Reponer PEPS a lotes preferidos y luego al más reciente
--    (ajustes en planta: se usó menos que la receta)
-- ------------------------------------------------------------
create or replace function reponer_peps_lotes(
  p_mp_id bigint,
  p_cantidad numeric,
  p_prefer jsonb default '[]'::jsonb,
  p_ajustar_stock boolean default false
)
returns jsonb
language plpgsql
as $$
declare
  r jsonb;
  l record;
  v_rest numeric := greatest(0, coalesce(p_cantidad, 0));
  v_toma numeric;
  v_out jsonb := '[]'::jsonb;
  v_cap numeric;
begin
  if v_rest <= 0 then
    return jsonb_build_object('repuestos', v_out, 'faltante', 0, 'stock_ajustado', false);
  end if;

  -- 1) Preferidos (ids de la orden), en el orden dado
  for r in select * from jsonb_array_elements(coalesce(p_prefer, '[]'::jsonb))
  loop
    exit when v_rest <= 0;
    continue when (r->>'id') is null;
    select * into l from raw_material_lots where id = (r->>'id')::bigint and mp_id = p_mp_id for update;
    continue when not found;
    v_cap := nullif((r->>'cantidad')::numeric, 0);
    v_toma := case when v_cap is null then v_rest else least(v_rest, v_cap) end;
    continue when v_toma <= 0;
    update raw_material_lots
      set cantidad_actual = coalesce(cantidad_actual, 0) + v_toma
      where id = l.id;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', l.id, 'lote', l.lote, 'cantidad', v_toma, 'costo_unitario', coalesce(l.costo_unitario, 0)
    ));
    v_rest := v_rest - v_toma;
  end loop;

  -- 2) Resto → lote más reciente de la MP
  if v_rest > 0 then
    select * into l from raw_material_lots
      where mp_id = p_mp_id
      order by fecha_entrada desc nulls last, id desc
      limit 1
      for update;
    if found then
      update raw_material_lots
        set cantidad_actual = coalesce(cantidad_actual, 0) + v_rest
        where id = l.id;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'id', l.id, 'lote', l.lote, 'cantidad', v_rest, 'costo_unitario', coalesce(l.costo_unitario, 0)
      ));
      v_rest := 0;
    end if;
  end if;

  -- 3) Sin ningún lote: crea uno de reposición para no dejar el stock huérfano de trazabilidad
  if v_rest > 0 then
    insert into raw_material_lots (
      mp_id, lote, fecha_entrada, cantidad_inicial, cantidad_actual, costo_unitario, creado_por
    ) values (
      p_mp_id, 'reposición', current_date, v_rest, v_rest, 0, 'sistema'
    )
    returning * into l;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', l.id, 'lote', l.lote, 'cantidad', v_rest, 'costo_unitario', coalesce(l.costo_unitario, 0)
    ));
    v_rest := 0;
  end if;

  if p_ajustar_stock and coalesce(p_cantidad, 0) > 0 then
    perform ajustar_stock_mp(p_mp_id, greatest(0, coalesce(p_cantidad, 0)));
  end if;

  return jsonb_build_object(
    'repuestos', v_out,
    'faltante', greatest(v_rest, 0),
    'stock_ajustado', coalesce(p_ajustar_stock, false)
  );
end;
$$;
