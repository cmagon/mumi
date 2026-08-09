-- v152 — Umbrales de envío gratis (detal y mayorista) para la barra de progreso
alter table config_catalogo
  add column if not exists envio_gratis_desde numeric default 0,
  add column if not exists envio_gratis_mayorista numeric default 0;

comment on column config_catalogo.envio_gratis_desde is
  'Monto (COP) a partir del cual el envío es gratis en modo detal. 0 = no aplica.';
comment on column config_catalogo.envio_gratis_mayorista is
  'Monto (COP) a partir del cual el envío es gratis en modo mayorista. 0 = no aplica.';
