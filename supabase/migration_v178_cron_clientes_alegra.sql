-- v178 — Importación y métricas de clientes AUTOMÁTICAS desde Alegra (cron de servidor).
--
-- Mantiene el módulo Clientes al día sin que nadie abra la app:
--   • alegra-contacts        → importa/actualiza los contactos (clientes) — 1 vez al día.
--   • alegra-ventas-cliente  → recalcula y guarda las métricas por cliente — cada 3 horas.
--
-- ANTES de ejecutar en Supabase → SQL Editor:
--   1. Reemplaza <SERVICE_ROLE_KEY> por tu service_role key
--      (Dashboard → Project Settings → API → service_role, secret).
--      Si ya corriste la v133, el secreto 'alegra_service_key' ya existe y este bloque solo lo
--      actualiza; puedes dejar tu misma key.
--   2. Despliega las funciones alegra-contacts y alegra-ventas-cliente (panel Edge Functions).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Guarda/actualiza la service key cifrada en Vault
do $$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'alegra_service_key';
  if v_id is null then
    perform vault.create_secret('<SERVICE_ROLE_KEY>', 'alegra_service_key', 'Service key para los cron de Alegra');
  else
    perform vault.update_secret(v_id, '<SERVICE_ROLE_KEY>', 'alegra_service_key');
  end if;
end $$;

-- Importar contactos: todos los días a las 06:00 UTC
select cron.unschedule('alegra-import-clientes') where exists (select 1 from cron.job where jobname = 'alegra-import-clientes');
select cron.schedule('alegra-import-clientes', '0 6 * * *', $cron$
  select net.http_post(
    url     := 'https://awjvggpeuxayvnreldvw.supabase.co/functions/v1/alegra-contacts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'alegra_service_key')
    ),
    body    := '{}'::jsonb
  );
$cron$);

-- Métricas por cliente: cada 3 horas
select cron.unschedule('alegra-metricas-clientes') where exists (select 1 from cron.job where jobname = 'alegra-metricas-clientes');
select cron.schedule('alegra-metricas-clientes', '0 */3 * * *', $cron$
  select net.http_post(
    url     := 'https://awjvggpeuxayvnreldvw.supabase.co/functions/v1/alegra-ventas-cliente',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'alegra_service_key')
    ),
    body    := '{}'::jsonb
  );
$cron$);

-- Verificación
select jobname, schedule, active from cron.job where jobname in ('alegra-import-clientes', 'alegra-metricas-clientes');
