-- v128 — Valoración del PRODUCTO EN PROCESO (saldos de mezcla).
--
-- Un saldo es mezcla ya fabricada (absorbió materia prima, mano de obra y CIF) que aún no se
-- empaca. Contablemente es inventario de producto en proceso y tiene valor, pero se llevaba
-- solo en peso: su costo se trataba como consumido del período aunque el producto todavía no
-- existiera como terminado, lo que subestima la utilidad cuando quedan saldos al cierre de mes.
alter table mezcla_saldos add column if not exists costo_unitario numeric;
comment on column mezcla_saldos.costo_unitario is
  'Costo por unidad de peso (en la `unidad` del saldo) de la mezcla en proceso, sin empaque. '
  'Valor del saldo = peso × costo_unitario.';
