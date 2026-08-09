-- v156 — CRM catálogo: suscriptores enriquecidos, favoritos por email, pedidos con código y estados

-- 1) Suscriptores: origen, baja, token de desuscripción
alter table suscriptores_catalogo
  add column if not exists origen text default 'newsletter',
  add column if not exists activo boolean not null default true,
  add column if not exists unsubscribed_at timestamptz,
  add column if not exists unsubscribe_token uuid default gen_random_uuid(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists pedido_at timestamptz;

comment on column suscriptores_catalogo.origen is
  'newsletter | popup | pedido | favorito';
comment on column suscriptores_catalogo.activo is
  'false = no quiere recibir correos (desuscrito)';

update suscriptores_catalogo
  set unsubscribe_token = coalesce(unsubscribe_token, gen_random_uuid())
  where unsubscribe_token is null;

-- Anon puede actualizar su propio registro (upsert nombre / desuscribir vía RPC)
drop policy if exists suscriptores_update_anon on suscriptores_catalogo;
-- (updates solo vía funciones security definer)

-- Buscar nombre por correo (precarga en checkout)
create or replace function catalogo_cliente_por_email(p_email text)
returns table(nombre text, activo boolean)
language sql
security definer
set search_path = public
as $$
  select s.nombre, s.activo
  from suscriptores_catalogo s
  where lower(s.email) = lower(trim(p_email))
  limit 1;
$$;
grant execute on function catalogo_cliente_por_email(text) to anon, authenticated;

-- Upsert suscriptor (newsletter / pedido / favorito)
create or replace function catalogo_upsert_suscriptor(
  p_email text,
  p_nombre text default null,
  p_origen text default 'newsletter'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_nombre text;
  v_token uuid;
  v_id bigint;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  v_nombre := nullif(trim(coalesce(p_nombre, '')), '');
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Correo inválido';
  end if;

  select id, unsubscribe_token into v_id, v_token
  from suscriptores_catalogo
  where lower(email) = v_email
  limit 1;

  if v_id is null then
    insert into suscriptores_catalogo (email, nombre, origen, activo, updated_at, pedido_at)
    values (
      v_email, v_nombre,
      coalesce(nullif(trim(p_origen), ''), 'newsletter'),
      true, now(),
      case when p_origen = 'pedido' then now() else null end
    )
    returning unsubscribe_token into v_token;
  else
    -- Correo ya existe: no reinsertar. Solo completar nombre vacío y marcar pedido_at.
    update suscriptores_catalogo set
      nombre = case when (nombre is null or btrim(nombre) = '') and v_nombre is not null then v_nombre else nombre end,
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
grant execute on function catalogo_upsert_suscriptor(text, text, text) to anon, authenticated;

-- Desuscribir por token (página pública)
create or replace function catalogo_desuscribir(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update suscriptores_catalogo
    set activo = false, unsubscribed_at = now(), updated_at = now()
  where unsubscribe_token = p_token and activo = true;
  return found;
end;
$$;
grant execute on function catalogo_desuscribir(uuid) to anon, authenticated;

-- 2) Pedidos: código único + email + estados intento/enviado/fallido
alter table pedidos_catalogo
  add column if not exists codigo text,
  add column if not exists email text,
  add column if not exists nombre text,
  add column if not exists mayorista boolean default false,
  add column if not exists confirmado_at timestamptz,
  add column if not exists wa_abierto_at timestamptz;

create unique index if not exists pedidos_catalogo_codigo_uidx
  on pedidos_catalogo (codigo) where codigo is not null;

-- Generar código de pedido
create or replace function catalogo_nuevo_codigo_pedido()
returns text
language plpgsql
as $$
declare
  v text;
begin
  loop
    v := 'MUMI-' || to_char(now() at time zone 'America/Bogota', 'YYMMDD') || '-' ||
         upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
    exit when not exists (select 1 from pedidos_catalogo where codigo = v);
  end loop;
  return v;
end;
$$;

create or replace function catalogo_iniciar_pedido(
  p_productos jsonb,
  p_total integer,
  p_nota text default null,
  p_email text default null,
  p_nombre text default null,
  p_mayorista boolean default false
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
    productos, total, nota, estado, codigo, email, nombre, mayorista, wa_abierto_at
  ) values (
    p_productos, coalesce(p_total, 0), p_nota, 'intento', v_codigo,
    nullif(lower(trim(coalesce(p_email, ''))), ''),
    nullif(trim(coalesce(p_nombre, '')), ''),
    coalesce(p_mayorista, false),
    now()
  ) returning pedidos_catalogo.id into v_id;

  -- Registrar / actualizar cliente
  if p_email is not null and trim(p_email) <> '' then
    perform catalogo_upsert_suscriptor(p_email, p_nombre, 'pedido');
  end if;

  return query select v_id, v_codigo;
end;
$$;
grant execute on function catalogo_iniciar_pedido(jsonb, integer, text, text, text, boolean) to anon, authenticated;

create or replace function catalogo_marcar_pedido(p_codigo text, p_estado text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_estado not in ('enviado', 'fallido', 'intento') then
    raise exception 'Estado inválido';
  end if;
  update pedidos_catalogo
    set estado = p_estado,
        confirmado_at = case when p_estado = 'enviado' then now() else confirmado_at end
  where codigo = p_codigo;
  return found;
end;
$$;
grant execute on function catalogo_marcar_pedido(text, text) to anon, authenticated;

-- 3) Favoritos por correo (sesión soft)
create table if not exists favoritos_catalogo (
  id          bigserial primary key,
  email       text not null,
  product_id  text not null,
  created_at  timestamptz default now()
);
create unique index if not exists favoritos_catalogo_uidx
  on favoritos_catalogo (lower(email), product_id);

alter table favoritos_catalogo enable row level security;

drop policy if exists favoritos_admin on favoritos_catalogo;
create policy favoritos_admin on favoritos_catalogo for all to authenticated
  using (true) with check (true);

create or replace function catalogo_listar_favoritos(p_email text)
returns table(product_id text)
language sql
security definer
set search_path = public
as $$
  select f.product_id
  from favoritos_catalogo f
  where lower(f.email) = lower(trim(p_email));
$$;
grant execute on function catalogo_listar_favoritos(text) to anon, authenticated;

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
  perform catalogo_upsert_suscriptor(p_email, p_nombre, 'favorito');
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
