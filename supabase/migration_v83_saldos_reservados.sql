-- v83 — Reserva de saldos de mezcla mientras una orden está en proceso (aún no cerrada).
-- Guarda el consumo PREVISTO del saldo por cada orden en proceso, para restarlo de lo disponible
-- y que no se pueda usar el mismo saldo dos veces antes de cerrar. Al cerrar/anular se limpia.
-- Ejecutar manualmente en el SQL Editor de Supabase.
alter table production_orders add column if not exists saldos_reservados jsonb;
