-- v81 — Personalización del Tablero en la nube + bandera de desarrollador
-- Ejecutar manualmente en el SQL Editor de Supabase.

-- 1) Bandera de desarrollador: SOLO tu usuario debe tenerla en true.
alter table user_profiles add column if not exists es_desarrollador boolean default false;

-- 2) Personalización individual del tablero (orden + módulos ocultos) por usuario.
alter table user_profiles add column if not exists dashboard_layout jsonb;

-- 3) Vista por defecto del tablero por ROL (la edita el desarrollador; aplica a todos los
--    usuarios de ese rol en todos los dispositivos).
alter table role_permissions add column if not exists dashboard_layout jsonb;

-- El guardado por rol usa UPSERT con conflicto en 'rol' → 'rol' debe ser único.
-- (Si ya es PRIMARY KEY o único, esto no hace falta y puede omitirse.)
create unique index if not exists role_permissions_rol_key on role_permissions (rol);

-- Marca tu usuario como desarrollador (ajusta el login si es distinto):
-- update user_profiles set es_desarrollador = true where login = 'TU_LOGIN';
