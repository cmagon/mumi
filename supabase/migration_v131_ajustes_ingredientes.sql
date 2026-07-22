-- v131 — Ajustes de ingredientes durante el diligenciamiento de una orden.
--
-- Si en planta se gasta más o sobra parte de un ingrediente, el operario corrige la cantidad en
-- el modal. Aquí queda el registro de esos cambios para poder: (a) descontar o devolver la
-- diferencia al stock de MP al enviar la orden, (b) avisar al admin, y (c) auditar después qué
-- se desvió de la receta y por qué.
--
-- Estructura: [{ mp_id, nombre, previsto, real, delta, unidad, motivo }]
--   previsto = lo que pedía la receta (gramos), real = lo que se usó, delta = real − previsto
--   delta > 0 → se gastó de más → se descuenta del stock
--   delta < 0 → sobró          → se devuelve al stock
alter table production_orders add column if not exists ajustes_ingredientes jsonb;
comment on column production_orders.ajustes_ingredientes is
  'Cambios de cantidad de ingredientes hechos en planta respecto de la receta. '
  'El stock de MP se ajusta con estos deltas al enviar la orden.';
