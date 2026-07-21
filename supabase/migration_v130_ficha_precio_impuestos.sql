-- v130 — Parámetros de precio POR FICHA + impuestos indirectos + archivos imprimibles.
--
-- utilidad_objetivo: % de utilidad deseado de ESTE producto. Antes era uno solo para toda la
--   empresa (costing_settings); cada producto puede tener su propio margen. Si queda NULL, se
--   usa el valor global como antes.
-- iva_pct / imp_saludable_pct: impuestos INDIRECTOS que se cobran al cliente SOBRE el precio.
--   No son costo ni salen de tu utilidad (los recaudas y los giras a la DIAN), por eso NO entran
--   en el cálculo del precio: solo sirven para mostrar el precio final al consumidor.
--   Distinto del ICA, que sí lo pagas tú sobre tus ingresos y por eso va en el divisor del precio.
-- imprimibles: archivos PDF (etiquetas, rótulos, instructivos) que el operario imprime al
--   ejecutar una orden de producción. [{ nombre, path, size, subido_por, fecha }]
alter table products_costing add column if not exists utilidad_objetivo numeric;
alter table products_costing add column if not exists iva_pct numeric default 0;
alter table products_costing add column if not exists imp_saludable_pct numeric default 0;
alter table products_costing add column if not exists imprimibles jsonb default '[]'::jsonb;

-- Bucket para los imprimibles de las fichas (privado: se accede con URL firmada)
insert into storage.buckets (id, name, public)
  values ('ficha-imprimibles', 'ficha-imprimibles', false)
on conflict (id) do nothing;

drop policy if exists "Auth read ficha-imprimibles"   on storage.objects;
drop policy if exists "Auth upload ficha-imprimibles" on storage.objects;
drop policy if exists "Auth delete ficha-imprimibles" on storage.objects;
create policy "Auth read ficha-imprimibles"   on storage.objects
  for select to authenticated using (bucket_id = 'ficha-imprimibles');
create policy "Auth upload ficha-imprimibles" on storage.objects
  for insert to authenticated with check (bucket_id = 'ficha-imprimibles');
create policy "Auth delete ficha-imprimibles" on storage.objects
  for delete to authenticated using (bucket_id = 'ficha-imprimibles');
