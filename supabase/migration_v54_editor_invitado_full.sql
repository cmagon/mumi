-- v54: edición completa del invitado dentro de la carpeta compartida (leer/crear/editar)
alter table document_shares add column if not exists carpeta text;   -- ruta raíz compartida ('' = todo)

-- Función auxiliar: ¿el correo autenticado tiene un enlace de edición vigente que cubre esta ruta?
-- Se evalúa por política. carpeta vacía = cubre todo.
drop policy if exists documentos_select_invitado on documentos;
create policy documentos_select_invitado on documentos for select to authenticated
using (exists (
  select 1 from document_shares s
  where s.permiso = 'edicion'
    and lower(s.email_invitado) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and (s.expira_at is null or s.expira_at > now())
    and (coalesce(s.carpeta,'') = '' or proceso = s.carpeta or proceso like s.carpeta || '/%')
));

drop policy if exists documentos_insert_invitado on documentos;
create policy documentos_insert_invitado on documentos for insert to authenticated
with check (exists (
  select 1 from document_shares s
  where s.permiso = 'edicion'
    and lower(s.email_invitado) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and (s.expira_at is null or s.expira_at > now())
    and (coalesce(s.carpeta,'') = '' or proceso = s.carpeta or proceso like s.carpeta || '/%')
));

-- Edición (incluye enviar a papelera con eliminado_at): sustituye a la de v51 por una con alcance por carpeta
drop policy if exists documentos_editor_invitado on documentos;
create policy documentos_editor_invitado on documentos for update to authenticated
using (exists (
  select 1 from document_shares s
  where s.permiso = 'edicion'
    and lower(s.email_invitado) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and (s.expira_at is null or s.expira_at > now())
    and (coalesce(s.carpeta,'') = '' or proceso = s.carpeta or proceso like s.carpeta || '/%')
))
with check (true);
