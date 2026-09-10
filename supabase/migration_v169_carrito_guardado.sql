-- v169 — «Carrito abandonado» real: solo cuenta cuando un cliente identificado guardó
-- explícitamente su carrito «para después» y pasaron 3 días sin comprarlo.
--
-- Antes, cualquier carrito con productos de un correo conocido se contaba como abandonado
-- (sobreconteo inmediato). Ahora se marca con `guardado = true` solo desde la acción
-- «Guardar para después» (disponible para clientes con sesión), y la métrica exige además
-- 3 días de inactividad.

alter table carritos_catalogo
  add column if not exists guardado boolean default false,
  add column if not exists user_id  uuid;

-- Acción «Guardar para después»: upsert del carrito marcándolo como guardado.
create or replace function catalogo_guardar_para_despues(
  p_email    text,
  p_user_id  uuid default null,
  p_nombre   text default null,
  p_telefono text default null,
  p_items    jsonb default '[]'::jsonb,
  p_total    integer default 0,
  p_n_items  integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' or position('@' in v_email) = 0 then
    return;
  end if;

  insert into carritos_catalogo (email, user_id, nombre, telefono, items, total, n_items, estado, guardado, actualizado_at)
  values (
    v_email, p_user_id,
    nullif(trim(coalesce(p_nombre, '')), ''),
    nullif(trim(coalesce(p_telefono, '')), ''),
    coalesce(p_items, '[]'::jsonb),
    coalesce(p_total, 0),
    coalesce(p_n_items, 0),
    'carrito', true, now()
  )
  on conflict (lower(email)) do update set
    user_id  = coalesce(excluded.user_id, carritos_catalogo.user_id),
    nombre   = coalesce(nullif(trim(coalesce(excluded.nombre, '')), ''), carritos_catalogo.nombre),
    telefono = coalesce(nullif(trim(coalesce(excluded.telefono, '')), ''), carritos_catalogo.telefono),
    items    = excluded.items,
    total    = excluded.total,
    n_items  = excluded.n_items,
    estado   = 'carrito',
    guardado = true,
    actualizado_at = now();

  perform catalogo_upsert_suscriptor(v_email, p_nombre, 'carrito', p_telefono);
end;
$$;
grant execute on function catalogo_guardar_para_despues(text, uuid, text, text, jsonb, integer, integer) to anon, authenticated;

-- Al comprar o vaciar, el carrito deja de estar «guardado» (ya no es un abandono).
create or replace function catalogo_marcar_carrito(p_email text, p_estado text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if p_estado not in ('carrito', 'comprado', 'vaciado') then
    raise exception 'Estado de carrito inválido';
  end if;
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then return false; end if;
  update carritos_catalogo
    set estado = p_estado,
        guardado = case when p_estado = 'carrito' then guardado else false end,
        actualizado_at = now()
  where lower(email) = v_email;
  return found;
end;
$$;
grant execute on function catalogo_marcar_carrito(text, text) to anon, authenticated;
