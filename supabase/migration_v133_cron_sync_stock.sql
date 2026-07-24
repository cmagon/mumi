-- v133 — Sincronización AUTOMÁTICA de stock con Alegra cada 15 minutos (cron de servidor).
--
-- El stock de producto terminado debe bajar cuando se factura en Alegra, aunque nadie tenga la
-- app abierta. Este cron llama a la Edge Function `alegra-sync-stock` cada 15 minutos.
--
-- La service_role key se guarda en Supabase Vault (cifrada), no en texto plano. La URL no es
-- secreta y va embebida (tu project ref: awjvggpeuxayvnreldvw).
--
-- ANTES de ejecutar:
--   1. Reemplaza <SERVICE_ROLE_KEY> por tu service_role key
--      (Dashboard → Project Settings → API → service_role, secret).
--   2. Despliega la función:  supabase functions deploy alegra-sync-stock
--   3. alegra_config.sync_desde debe tener fecha (lo crea la migración v48).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Guarda (o actualiza) la service key en Vault con el nombre 'alegra_service_key'.
do $$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'alegra_service_key';
  if v_id is null then
    perform vault.create_secret('<SERVICE_ROLE_KEY>', 'alegra_service_key', 'Service key para el cron de sincronización con Alegra');
  else
    perform vault.update_secret(v_id, '<SERVICE_ROLE_KEY>', 'alegra_service_key');
  end if;
end $$;

-- Quita el job anterior si se re-ejecuta esta migración
select cron.unschedule('alegra-sync-stock') where exists (select 1 from cron.job where jobname = 'alegra-sync-stock');

-- Cada 15 minutos: POST a la Edge Function con la service key leída de Vault en ese momento.
select cron.schedule('alegra-sync-stock', '*/15 * * * *', $cron$
  select net.http_post(
    url     := 'https://awjvggpeuxayvnreldvw.supabase.co/functions/v1/alegra-sync-stock',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'alegra_service_key')
    ),
    body    := '{}'::jsonb
  );
$cron$);

-- Verificación: debe listar el job programado
select jobname, schedule, active from cron.job where jobname = 'alegra-sync-stock';
