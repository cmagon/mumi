-- v53: los usuarios INTERNOS (con perfil) pueden editar documentos (p.ej. renombrar carpetas = cambiar proceso).
-- Los invitados externos por OTP NO tienen perfil, así que esta política NO les aplica: ellos solo pueden
-- editar lo compartido con su correo y vigente (política documentos_editor_invitado de v51).
drop policy if exists documentos_update_internos on documentos;
create policy documentos_update_internos on documentos for update to authenticated
  using (exists (select 1 from user_profiles up where up.id = auth.uid()))
  with check (exists (select 1 from user_profiles up where up.id = auth.uid()));
