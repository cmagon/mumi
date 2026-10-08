-- ============================================================
-- MUMI AMAZONIA — Migration v183: controles de proceso y calidad en la orden
--
-- El operario diligencia (opcional) pH, °Brix, temperaturas, verificaciones previas SÍ/NO,
-- características organolépticas, etc. en el paso de resultados de la orden. Se guardan como
-- { "calidad.ph": "3,4", "check.despeje_linea": true, ... } y salen en la plantilla PTZ-OR-01
-- con los marcadores del mismo nombre ({{calidad.ph}}, {{check.despeje_linea}}).
--
-- Es opcional: sin esta columna la app sigue funcionando (simplemente no guarda los controles).
-- Ejecutar en: Supabase Dashboard → SQL Editor.
-- ============================================================
alter table production_orders
  add column if not exists controles jsonb not null default '{}'::jsonb;

comment on column production_orders.controles is
  'Controles de proceso/calidad diligenciados por el operario: { id_de_campo: valor }. Ver src/lib/plantillaCampos.js (CAPTURA_UI).';
