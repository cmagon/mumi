-- v78: stock RESERVADO por remisiones de Alegra.
-- Disponible = stock - reservado. Una remisión aparta (reserva) el producto; al facturar esa
-- remisión, se descuenta del stock y se libera la reserva. Si la remisión se anula, se libera.
alter table finished_products add column if not exists reservado numeric not null default 0;
