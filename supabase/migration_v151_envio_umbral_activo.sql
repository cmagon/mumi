-- v151 — Barra de umbral de envío / pedido mínimo (solo interruptor on/off)
alter table config_catalogo
  add column if not exists envio_umbral_activo boolean default false;

comment on column config_catalogo.envio_umbral_activo is
  'Si es true, el catálogo muestra la barra de umbral (pedido mínimo / envío).';
