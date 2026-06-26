-- v74: registra qué saldos consumió cada orden (para reponerlos al devolver la orden).
-- Estructura: [{ "saldo_id": "...", "cantidad": N }, ...]
alter table production_orders add column if not exists saldos_consumidos jsonb;
