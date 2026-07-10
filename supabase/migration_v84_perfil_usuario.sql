-- v84 — Datos personales editables por CUALQUIER usuario desde "Mi perfil"
-- (no solo empleados). Se guardan en su propio perfil de usuario.
alter table user_profiles add column if not exists telefono          text;
alter table user_profiles add column if not exists correo            text;
alter table user_profiles add column if not exists direccion         text;
alter table user_profiles add column if not exists fecha_nacimiento  date;
alter table user_profiles add column if not exists foto_url          text;
