-- v157 — Si el correo ya existe, no reinsertar ni reactivar; solo completar nombre vacío / pedido_at

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
