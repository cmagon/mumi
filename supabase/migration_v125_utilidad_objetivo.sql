-- v125 — Parámetros para el precio sugerido de venta (costeo por absorción).
--   utilidad_objetivo: % de utilidad deseado sobre el PRECIO.
--   ica_por_mil:       tarifa de ICA en por mil sobre ventas brutas (ej. 7 = 0,7%).
-- El precio se calcula: costo pleno ÷ (1 − %comisión − %ICA − %utilidad).
-- Ver getPrecioSugerido() en src/lib/businessLogic.js.
alter table costing_settings add column if not exists utilidad_objetivo numeric default 30;
alter table costing_settings add column if not exists ica_por_mil numeric default 0;
