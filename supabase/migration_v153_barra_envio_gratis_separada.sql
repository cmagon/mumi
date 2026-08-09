-- v153 — Barra de envío gratis independiente de la de pedido mínimo
alter table config_catalogo
  add column if not exists envio_gratis_barra_activo boolean default false;

comment on column config_catalogo.envio_umbral_activo is
  'Mostrar barra de pedido mínimo sugerido (nacional). Independiente del envío gratis.';
comment on column config_catalogo.envio_gratis_barra_activo is
  'Mostrar barra de envío gratis nacional. Independiente del pedido mínimo.';
