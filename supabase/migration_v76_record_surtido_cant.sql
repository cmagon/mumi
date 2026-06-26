-- v76: cantidad de cajas surtidas en el registro de producción (para el análisis por producto).
alter table production_records add column if not exists surtido_cantidad numeric;

-- Rellena los registros principales históricos con las cajas surtidas de su orden vinculada,
-- para que el Análisis muestre la cantidad empacada final (cajas) y no las unidades del bocadillo base.
update production_records pr
set surtido_cantidad = po.surtido_cantidad
from production_orders po
where pr.orden_id = po.id
  and pr.surtido is true
  and pr.surtido_cantidad is null
  and po.surtido_cantidad is not null;
