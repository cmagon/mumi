-- v50: permitir lectura anónima de app_settings (para mostrar logo/nombre en la vista pública compartida)
drop policy if exists app_settings_select on app_settings;
create policy app_settings_select on app_settings for select to anon, authenticated using (true);
