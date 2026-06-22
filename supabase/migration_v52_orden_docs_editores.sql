-- v52: permitir que cualquier usuario autenticado guarde el ORDEN/ESTRUCTURA de carpetas (app_settings id=2),
-- sin poder tocar la configuración de empresa (id=1, que sigue siendo solo admin por la política de v38/v50).
drop policy if exists app_settings_orden_docs on app_settings;
create policy app_settings_orden_docs on app_settings for all to authenticated
  using (id = 2) with check (id = 2);
