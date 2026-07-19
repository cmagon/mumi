-- v99 — Tienda: captura de suscriptores (newsletter) + campos de tienda.

-- 1) Suscriptores del catálogo (captura de correos para ofertas)
create table if not exists suscriptores_catalogo (
  id         bigserial primary key,
  email      text not null,
  nombre     text,
  created_at timestamptz default now()
);
create unique index if not exists suscriptores_email_uidx on suscriptores_catalogo (lower(email));

alter table suscriptores_catalogo enable row level security;
-- El público SOLO puede suscribirse (insertar); el admin (authenticated) puede leer.
drop policy if exists suscriptores_insert on suscriptores_catalogo;
create policy suscriptores_insert on suscriptores_catalogo for insert to anon with check (true);
drop policy if exists suscriptores_admin on suscriptores_catalogo;
create policy suscriptores_admin on suscriptores_catalogo for select to authenticated using (true);

-- 2) "Novedad": marca de producto nuevo (además de destacado). Opcional para la sección Novedades.
alter table finished_products add column if not exists catalogo_novedad boolean not null default false;

-- Columnas base de la v98 (por si esta migración se corre sin la v98): frutos múltiples.
alter table finished_products add column if not exists catalogo_frutos text[];
update finished_products
  set catalogo_frutos = array[catalogo_fruto]
  where catalogo_fruto is not null and (catalogo_frutos is null or catalogo_frutos = '{}');

-- 3) La vista pública expone stock (para mostrar "Agotado") y novedad.
--    Se borra primero porque cambian las columnas (create or replace no permite quitar columnas).
drop view if exists catalogo_productos;
create view catalogo_productos as
  select
    fp.id,
    fp.nombre,
    coalesce(fp.descripcion, '')                          as descripcion,
    fp.precio_detal,
    fp.precio_mayor,
    fp.imagen_url,
    coalesce(fp.imagenes, '[]'::jsonb)                    as imagenes,
    coalesce(pc.tipo, 'otros')                            as categoria,
    coalesce(fp.catalogo_frutos, '{}')                    as frutos,
    coalesce(fp.catalogo_beneficios, '{}')                as beneficios,
    fp.catalogo_destacado                                 as destacado,
    coalesce(fp.catalogo_novedad, false)                  as novedad,
    coalesce(fp.stock, 0)                                 as stock,
    fp.created_at
  from finished_products fp
  left join products_costing pc on pc.id = fp.product_id
  where fp.catalogo_visible = true and coalesce(fp.activo, true) = true;

grant select on catalogo_productos to anon;
