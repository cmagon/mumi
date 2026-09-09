-- v167 — Gestión de pedidos (fulfillment): estado de envío separado del estado de captación.
--
-- `estado` (existente) = captación del pedido: 'intento' | 'enviado' (el cliente envió el
--   pedido por WhatsApp) | 'fallido'. NO se toca para no romper métricas del CRM.
-- `estado_envio` (nuevo) = ciclo logístico que gestiona el admin:
--   'pendiente' → 'despachado' (con guía) → 'entregado'  ·  o 'cancelado'.
--
-- El admin (rol authenticated) ya tiene acceso total a pedidos_catalogo (v97), así que
-- las actualizaciones se hacen con UPDATE directo desde el panel; no hace falta RPC.

alter table pedidos_catalogo
  add column if not exists estado_envio   text default 'pendiente',
  add column if not exists guia           text,
  add column if not exists transportadora text,
  add column if not exists nota_envio     text,
  add column if not exists despachado_at  timestamptz,
  add column if not exists entregado_at   timestamptz,
  add column if not exists cancelado_at   timestamptz,
  add column if not exists cancel_motivo  text;

-- Índice para filtrar/listar por estado logístico en el panel.
create index if not exists pedidos_catalogo_estado_envio_idx
  on pedidos_catalogo (estado_envio);

-- Los pedidos ya existentes quedan como 'pendiente' por el default; normalizamos
-- explícitamente los nulos por si la columna existía sin default.
update pedidos_catalogo set estado_envio = 'pendiente' where estado_envio is null;
