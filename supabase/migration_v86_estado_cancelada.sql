-- v86 — Permite el nuevo estado "cancelada" (Cerrada sin ejecutar) en production_orders.
-- El check constraint actual solo permite: pendiente, en_proceso, ejecutada, aprobada, rechazada.
-- Ejecutar manualmente en el SQL Editor de Supabase.
alter table production_orders drop constraint if exists production_orders_estado_check;
alter table production_orders add constraint production_orders_estado_check
  check (estado in ('pendiente', 'en_proceso', 'ejecutada', 'aprobada', 'rechazada', 'cancelada'));
