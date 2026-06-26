-- v77: marca y enlaza retroactivamente los lotes históricos que fueron consumidos por un surtido.
-- Para cada orden surtida, recorre sus saldos_consumidos, ubica el saldo (mezcla_saldos) para saber
-- su lote/producto, y marca el registro original de ese lote como surtido, enlazándolo con la caja.
update production_records pr
set surtido = true,
    producto_surtido = coalesce(pr.producto_surtido, po.producto_surtido),
    lote_mezcla = coalesce(nullif(pr.lote_mezcla, ''), po.lote)
from production_orders po
cross join lateral jsonb_array_elements(po.saldos_consumidos) as sc
join mezcla_saldos ms on ms.id::text = (sc->>'saldo_id')
where po.surtido = true
  and po.saldos_consumidos is not null
  and jsonb_typeof(po.saldos_consumidos) = 'array'
  and pr.lote = ms.lote
  and pr.producto = ms.producto;
