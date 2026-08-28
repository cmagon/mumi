-- v160 — Sync automático del catálogo → Google Sheets (cada 15 min).
--
-- Requiere:
--   1. Apps Script de docs/google-sheets-catalog-appscript.gs desplegado como Web app
--   2. Secret:  supabase secrets set GOOGLE_SHEETS_WEBAPP_URL="https://script.google.com/macros/s/.../exec"
--   3. Deploy:  supabase functions deploy sheets-sync-catalog
--   4. Vault:   mismo secret alegra_service_key (service_role) o créalo aquí
--
-- Hoja (oculta en código de la edge function):
--   https://docs.google.com/spreadsheets/d/1L-Wj2A-uKw5d8ocdbce1s_3YRgYDvGd8FMpaPJBuzs0/edit

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Reusa la service key del Vault (alegra_service_key). Si no existe, créala como en v133.
do $$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'alegra_service_key';
  if v_id is null then
    perform vault.create_secret('<SERVICE_ROLE_KEY>', 'alegra_service_key', 'Service key para crons (Alegra + Sheets)');
  end if;
end $$;

select cron.unschedule('sheets-sync-catalog')
where exists (select 1 from cron.job where jobname = 'sheets-sync-catalog');

select cron.schedule('sheets-sync-catalog', '*/15 * * * *', $cron$
  select net.http_post(
    url     := 'https://awjvggpeuxayvnreldvw.supabase.co/functions/v1/sheets-sync-catalog',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'alegra_service_key')
    ),
    body    := '{"all":true}'::jsonb
  );
$cron$);

select jobname, schedule, active from cron.job where jobname = 'sheets-sync-catalog';
