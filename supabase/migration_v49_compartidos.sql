-- v49: enlaces para compartir carpetas/documentos como vista pública de solo lectura
create extension if not exists "pgcrypto";
create table if not exists document_shares (
  token uuid primary key default gen_random_uuid(),
  titulo text,
  items jsonb not null default '[]'::jsonb,   -- [{ nombre, codigo, url }] (compat plano)
  grupos jsonb,                                -- [{ proceso, items:[{nombre,codigo,url}] }] (estructura de carpetas)
  expira_at timestamptz,
  creado_por text,
  created_at timestamptz not null default now()
);
alter table document_shares enable row level security;
-- Lectura pública (anónima) para que el destinatario pueda ver el enlace sin iniciar sesión
drop policy if exists document_shares_read on document_shares;
create policy document_shares_read on document_shares for select to anon, authenticated using (true);
-- Solo usuarios autenticados pueden crear enlaces
drop policy if exists document_shares_write on document_shares;
create policy document_shares_write on document_shares for all to authenticated
  using (exists (select 1 from user_profiles up where up.id = auth.uid()))
  with check (exists (select 1 from user_profiles up where up.id = auth.uid()));
