-- v83 — Foto de perfil del empleado (editable por el propio usuario desde "Mi perfil").
alter table employees add column if not exists foto_url text;
