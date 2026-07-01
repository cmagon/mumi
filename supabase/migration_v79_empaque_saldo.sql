-- v79: orden de EMPAQUE DE SALDO. Permite crear una orden cuya finalidad es empacar un saldo de
-- mezcla ya existente (no produce desde cero): no reserva MP, no calcula por ingredientes.
alter table production_orders add column if not exists empaque_saldo boolean not null default false;
alter table production_orders add column if not exists saldo_pack jsonb;   -- [{ saldo_id, cantidad(peso), unidad }]
