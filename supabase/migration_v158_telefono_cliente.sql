-- v158 — Teléfono del cliente (guardar + precargar por correo)

alter table suscriptores_catalogo
  add column if not exists telefono text;

alter table pedidos_catalogo
  add column if not exists telefono text;

comment on column suscriptores_catalogo.telefono is 'Celular / WhatsApp del cliente';

-- Precarga: nombre + teléfono por correo
drop function if exists catalogo_cliente_por_email(text);
create function catalogo_cliente_por_email(p_email text)
returns table(nombre text, activo boolean, telefono text)
language sql
security definer
set search_path = public
as $$
  select s.nombre, s.activo, s.telefono
  from suscriptores_catalogo s
  where lower(s.email) = lower(trim(p_email))
  limit 1;
$$;
grant execute on function catalogo_cliente_por_email(text) to anon, authenticated;

-- Upsert con teléfono (reemplaza overload de 3 args)
drop function if exists catalogo_upsert_suscriptor(text, text, text);
create function catalogo_upsert_suscriptor(
  p_email text,
  p_nombre text default null,
  p_origen text default 'newsletter',
  p_telefono text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_nombre text;
  v_tel text;
  v_token uuid;
  v_id bigint;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  v_nombre := nullif(trim(coalesce(p_nombre, '')), '');
  v_tel := nullif(trim(coalesce(p_telefono, '')), '');
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Correo inválido';
  end if;

  select id, unsubscribe_token into v_id, v_token
  from suscriptores_catalogo
  where lower(email) = v_email
  limit 1;

  if v_id is null then
    insert into suscriptores_catalogo (email, nombre, telefono, origen, activo, updated_at, pedido_at)
    values (
      v_email, v_nombre, v_tel,
      coalesce(nullif(trim(p_origen), ''), 'newsletter'),
      true, now(),
      case when p_origen = 'pedido' then now() else null end
    )
    returning unsubscribe_token into v_token;
  else
    -- Ya existe: completar nombre/teléfono vacíos; no duplicar correo
    update suscriptores_catalogo set
      nombre = case when (nombre is null or btrim(nombre) = '') and v_nombre is not null then v_nombre else nombre end,
      telefono = case when (telefono is null or btrim(telefono) = '') and v_tel is not null then v_tel
                      when v_tel is not null then v_tel
                      else telefono end,
      updated_at = now(),
      pedido_at = case when p_origen = 'pedido' then now() else pedido_at end
    where id = v_id;
    if v_token is null then
      update suscriptores_catalogo set unsubscribe_token = gen_random_uuid()
      where id = v_id returning unsubscribe_token into v_token;
    end if;
  end if;
  return v_token;
end;
$$;
grant execute on function catalogo_upsert_suscriptor(text, text, text, text) to anon, authenticated;

-- Pedido: guardar teléfono del comprador
drop function if exists catalogo_iniciar_pedido(jsonb, integer, text, text, text, boolean);
create function catalogo_iniciar_pedido(
  p_productos jsonb,
  p_total integer,
  p_nota text default null,
  p_email text default null,
  p_nombre text default null,
  p_mayorista boolean default false,
  p_telefono text default null
)
returns table(id bigint, codigo text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text;
  v_id bigint;
begin
  v_codigo := catalogo_nuevo_codigo_pedido();
  insert into pedidos_catalogo (
    productos, total, nota, estado, codigo, email, nombre, telefono, mayorista, wa_abierto_at
  ) values (
    p_productos, coalesce(p_total, 0), p_nota, 'intento', v_codigo,
    nullif(lower(trim(coalesce(p_email, ''))), ''),
    nullif(trim(coalesce(p_nombre, '')), ''),
    nullif(trim(coalesce(p_telefono, '')), ''),
    coalesce(p_mayorista, false),
    now()
  ) returning pedidos_catalogo.id into v_id;

  if p_email is not null and trim(p_email) <> '' then
    perform catalogo_upsert_suscriptor(p_email, p_nombre, 'pedido', p_telefono);
  end if;

  return query select v_id, v_codigo;
end;
$$;
grant execute on function catalogo_iniciar_pedido(jsonb, integer, text, text, text, boolean, text) to anon, authenticated;

-- Favoritos: upsert sigue con firma nueva (teléfono null)
create or replace function catalogo_toggle_favorito(p_email text, p_product_id text, p_nombre text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_on boolean;
begin
  if p_email is null or trim(p_email) = '' or p_product_id is null or trim(p_product_id) = '' then
    raise exception 'Datos incompletos';
  end if;
  perform catalogo_upsert_suscriptor(p_email, p_nombre, 'favorito', null);
  if exists (
    select 1 from favoritos_catalogo
    where lower(email) = lower(trim(p_email)) and product_id = trim(p_product_id)
  ) then
    delete from favoritos_catalogo
    where lower(email) = lower(trim(p_email)) and product_id = trim(p_product_id);
    v_on := false;
  else
    insert into favoritos_catalogo (email, product_id)
    values (lower(trim(p_email)), trim(p_product_id));
    v_on := true;
  end if;
  return v_on;
end;
$$;
grant execute on function catalogo_toggle_favorito(text, text, text) to anon, authenticated;
