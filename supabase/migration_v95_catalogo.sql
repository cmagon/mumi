-- v95 — Catálogo público (segundo Worker). Lee de producto terminado + ficha.
-- SEGURIDAD: el catálogo es público (rol anon). NO se le da acceso directo a finished_products
-- (contiene costos). Se expone SOLO una VISTA con columnas seguras y productos publicados.

-- 1) Campos propios del catálogo sobre el producto terminado
alter table finished_products add column if not exists catalogo_visible    boolean not null default false;
alter table finished_products add column if not exists catalogo_destacado  boolean not null default false;
alter table finished_products add column if not exists catalogo_orden      integer not null default 0;
alter table finished_products add column if not exists catalogo_categoria  text;      -- 'infusion' | 'galleta' | 'confite' | 'granel'
alter table finished_products add column if not exists catalogo_fruto      text;      -- 'asai' | 'araza' | 'cocona' | 'seje' | 'copoazu'
alter table finished_products add column if not exists catalogo_beneficios text[];    -- ['Antioxidantes', ...]

-- 2) VISTA pública: solo columnas seguras (sin costos) y solo productos publicados.
--    La vista es SECURITY DEFINER (dueño postgres) → lee finished_products sin exponer la tabla base al anon.
create or replace view catalogo_productos as
  select
    id,
    nombre,
    coalesce(descripcion, '')               as descripcion,
    precio_detal,
    precio_mayor,
    imagen_url,
    coalesce(imagenes, '[]'::jsonb)         as imagenes,
    catalogo_categoria                       as categoria,
    catalogo_fruto                           as fruto,
    coalesce(catalogo_beneficios, '{}')      as beneficios,
    catalogo_destacado                       as destacado,
    catalogo_orden                           as orden,
    coalesce(stock, 0)                       as stock
  from finished_products
  where catalogo_visible = true and coalesce(activo, true) = true;

grant select on catalogo_productos to anon;

-- 3) Config visual del catálogo (una sola fila)
create table if not exists config_catalogo (
  id             integer primary key default 1,
  plantilla      text default 'amazonia',            -- 'amazonia' | 'natural' | 'noche'
  color_primario text default '#1a3a2a',
  color_acento   text default '#C8A94A',
  tipografia     text default 'playfair',            -- 'playfair' | 'sans' | 'clasica'
  whatsapp       text default '+573157702180',
  pedido_minimo  integer default 30000,
  mostrar_mayor  boolean default false,
  titulo_banner  text default 'Sabores de la selva',
  subtitulo      text default 'Infusiones, galletas y dulces amazónicos',
  updated_at     timestamptz default now()
);
insert into config_catalogo (id) values (1) on conflict (id) do nothing;

-- 4) Métricas de visitas
create table if not exists visitas_catalogo (
  id          bigserial primary key,
  fecha       date default current_date,
  hora        time default current_time,
  producto    text,
  dispositivo text,                                   -- 'mobile' | 'tablet' | 'desktop'
  ciudad      text,
  referrer    text
);

-- 5) Pedidos iniciados por WhatsApp
create table if not exists pedidos_catalogo (
  id          bigserial primary key,
  created_at  timestamptz default now(),
  productos   jsonb,                                  -- [{nombre, cantidad, precio}]
  total       integer,
  nota        text,
  estado      text default 'iniciado'                 -- 'iniciado' | 'confirmado' | 'entregado'
);

-- 6) RLS
alter table config_catalogo  enable row level security;
alter table visitas_catalogo enable row level security;
alter table pedidos_catalogo enable row level security;

-- Config: lectura pública
drop policy if exists catalogo_config_read on config_catalogo;
create policy catalogo_config_read on config_catalogo for select to anon using (true);

-- Visitas y pedidos: el público SOLO puede insertar (no leer)
drop policy if exists catalogo_visitas_insert on visitas_catalogo;
create policy catalogo_visitas_insert on visitas_catalogo for insert to anon with check (true);

drop policy if exists catalogo_pedidos_insert on pedidos_catalogo;
create policy catalogo_pedidos_insert on pedidos_catalogo for insert to anon with check (true);

-- Nota: el sistema principal (rol authenticated/admin) sigue leyendo todo por sus políticas existentes;
-- aquí solo se añade el acceso público de lectura a la vista y config, e inserción de métricas/pedidos.
