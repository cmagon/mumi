-- v51: invitados con permiso de EDICIÓN vía correo (verificación por código OTP)
alter table document_shares add column if not exists email_invitado text;
alter table document_shares add column if not exists permiso text default 'lectura';   -- 'lectura' | 'edicion'
alter table document_shares add column if not exists doc_ids jsonb default '[]'::jsonb; -- ids de documentos editables

-- El invitado (autenticado por OTP con SU correo) puede editar SOLO los documentos compartidos con él,
-- y solo mientras el enlace no haya expirado.
drop policy if exists documentos_editor_invitado on documentos;
create policy documentos_editor_invitado on documentos for update to authenticated
using (
  exists (
    select 1 from document_shares s
    where s.permiso = 'edicion'
      and lower(s.email_invitado) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and (s.expira_at is null or s.expira_at > now())
      and s.doc_ids ? documentos.id::text
  )
)
with check (
  exists (
    select 1 from document_shares s
    where s.permiso = 'edicion'
      and lower(s.email_invitado) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and (s.expira_at is null or s.expira_at > now())
      and s.doc_ids ? documentos.id::text
  )
);
