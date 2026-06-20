-- v43: Mano de obra por destajo (operarios extra contratados para un día/orden puntual)
-- Se guarda como arreglo JSON en la orden: [{ nombre, modo, cantidad, tarifa }]
--   modo: 'unidad' | 'dia' | 'kg'  (cantidad × tarifa = total de esa línea)
alter table production_orders add column if not exists destajo jsonb;
