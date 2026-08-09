-- v157 — Tarifas de la calculadora de envíos (precio 1er kg y kg adicional)
alter table costing_settings
  add column if not exists precio_kilo numeric default null,
  add column if not exists precio_adicional numeric default null;

comment on column costing_settings.precio_kilo is
  'Tarifa del primer kilogramo (COP) para la calculadora de envíos.';
comment on column costing_settings.precio_adicional is
  'Tarifa por cada kilogramo adicional (COP) para la calculadora de envíos.';
