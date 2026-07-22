-- v130 — Parámetros de precio POR FICHA + impuestos indirectos + archivos imprimibles.
--
-- utilidad_objetivo: % de utilidad deseado de ESTE producto. Antes era uno solo para toda la
--   empresa (costing_settings); cada producto puede tener su propio margen. Si queda NULL, se
--   usa el valor global como antes.
-- Impuestos INDIRECTOS: se cobran al cliente SOBRE el precio. No son costo ni salen de tu
--   utilidad (los recaudas y los giras a la DIAN), por eso NO entran en el cálculo del precio:
--   solo sirven para mostrar el precio final al consumidor. Distinto del ICA, que sí lo pagas
--   tú sobre tus ingresos y por eso va en el divisor del precio.
--   iva_pct:            0, 5 o 19 según el producto (art. 468 y ss. ET).
--   imp_saludable_pct:  ICUI — impuesto a comestibles ultraprocesados, 20% desde 2025
--                       (Ley 2277/2022, art. 513-6 y ss. ET). Ad valorem sobre el precio.
--   ibua_valor:         IBUA — impuesto a bebidas azucaradas. NO es porcentaje: es un valor
--                       FIJO en pesos por cada 100 ml según el contenido de azúcar, indexado
--                       por UVT cada enero. Aquí se guarda ya calculado por unidad de venta.
--   Según DIAN Concepto 541 de 2024, el IBUA y el ICUI NO forman parte de la base gravable
--   del IVA: se discriminan por separado en la factura. Por eso los tres se suman al precio
--   de forma independiente (aditiva), no en cascada.
-- imprimibles: archivos PDF (etiquetas, rótulos, instructivos) que el operario imprime al
--   ejecutar una orden de producción. [{ nombre, path, size, subido_por, fecha }]
alter table products_costing add column if not exists utilidad_objetivo numeric;
alter table products_costing add column if not exists iva_pct numeric default 0;
alter table products_costing add column if not exists imp_saludable_pct numeric default 0;
alter table products_costing add column if not exists ibua_valor numeric default 0;
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
