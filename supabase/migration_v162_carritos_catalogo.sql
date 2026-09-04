-- v162 — Carritos del catálogo: captura de carritos de clientes identificados por correo
-- para seguimiento y recuperación de carritos abandonados.
-- Se guarda solo cuando el cliente ya dio su correo (sesión soft). Un registro por correo.

create table if not exists carritos_catalogo (
  id           bigserial primary key,
  email        text not null,
  nombre       text,
  telefono     text,
  items        jsonb not null default '[]'::jsonb,  -- [{id, nombre, cantidad, precio}]
  total        integer not null default 0,
  n_items      integer not null default 0,
  estado       text not null default 'carrito',     -- 'carrito' | 'comprado' | 'vaciado'
  actualizado_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create unique index if not exists carritos_catalogo_email_uidx
  on carritos_catalogo (lower(email));
create index if not exists carritos_catalogo_estado_idx
  on carritos_catalogo (estado, actualizado_at desc);

alter table carritos_catalogo enable row level security;

-- Solo el admin (autenticado) puede leer/gestionar; el público escribe vía RPC security definer
drop policy if exists carritos_admin on carritos_catalogo;
create policy carritos_admin on carritos_catalogo for all to authenticated
  using (true) with check (true);

comment on table carritos_catalogo is
  'Carritos de clientes identificados por correo (seguimiento y recuperación de abandonos)';
comment on column carritos_catalogo.estado is
  'carrito = con productos sin comprar · comprado = generó pedido · vaciado = quedó sin productos';

-- Guardar / actualizar el carrito del cliente (upsert por correo). Registra al suscriptor.
create or replace function catalogo_guardar_carrito(
  p_email    text,
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
  v_estado text;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' or position('@' in v_email) = 0 then
    return; -- sin correo válido no se captura
  end if;
  v_estado := case when coalesce(p_n_items, 0) > 0 then 'carrito' else 'vaciado' end;

  insert into carritos_catalogo (email, nombre, telefono, items, total, n_items, estado, actualizado_at)
  values (
    v_email,
    nullif(trim(coalesce(p_nombre, '')), ''),
    nullif(trim(coalesce(p_telefono, '')), ''),
    coalesce(p_items, '[]'::jsonb),
    coalesce(p_total, 0),
    coalesce(p_n_items, 0),
    v_estado,
    now()
  )
  on conflict (lower(email)) do update set
    nombre   = coalesce(nullif(trim(coalesce(excluded.nombre, '')), ''), carritos_catalogo.nombre),
    telefono = coalesce(nullif(trim(coalesce(excluded.telefono, '')), ''), carritos_catalogo.telefono),
    items    = excluded.items,
    total    = excluded.total,
    n_items  = excluded.n_items,
    estado   = v_estado,
    actualizado_at = now();

  -- Mantiene la lista de suscriptores al día (sin duplicar)
  perform catalogo_upsert_suscriptor(v_email, p_nombre, 'carrito', p_telefono);
end;
$$;
grant execute on function catalogo_guardar_carrito(text, text, text, jsonb, integer, integer) to anon, authenticated;

-- Marca el carrito con un estado (p. ej. 'comprado' al confirmar el pedido)
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
    set estado = p_estado, actualizado_at = now()
  where lower(email) = v_email;
  return found;
end;
$$;
grant execute on function catalogo_marcar_carrito(text, text) to anon, authenticated;
