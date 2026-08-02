-- v136: marca de "inventario sin descontar" en órdenes cerradas sin conexión.
--
-- PROBLEMA
-- Al cerrar una orden sin conexión, la cola offline enviaba el cambio de estado y el registro de
-- producción, pero los movimientos de inventario (consumo de MP por lotes, empaque, saldos de
-- mezcla, entrada de subproducto, stock terminado) se saltaban por completo. La orden podía
-- quedar en 'ejecutada' —o incluso 'aprobada' si la cerraba un admin— sin haber descontado nada,
-- y no existía forma de saberlo: el descuadre solo aparecía al hacer inventario físico.
--
-- SOLUCIÓN
-- La app guarda esos movimientos como pendientes en el dispositivo y los aplica al reconectar.
-- Esta columna es la parte visible y compartida de ese estado: mientras esté en true, la orden
-- se marca en la tabla y no se puede aprobar. La app la pone al cerrar offline y la baja cuando
-- los movimientos quedaron aplicados.
--
-- Por qué también en la base y no solo en el dispositivo: quien cierra la orden sin conexión es
-- el operario en su tablet, pero quien la aprueba es el admin desde otro equipo. Sin esta
-- columna el admin no tendría manera de enterarse.

alter table production_orders add column if not exists inventario_pendiente boolean not null default false;

comment on column production_orders.inventario_pendiente is
  'true = la orden se cerró sin conexión y sus movimientos de inventario (MP, empaque, saldos, '
  'terminado) todavía no se han aplicado. Bloquea la aprobación hasta que se sincronicen.';

-- Índice parcial: la consulta natural es "¿hay órdenes con inventario pendiente?", que en
-- operación normal no devuelve nada. Un índice parcial ocupa casi cero y evita recorrer la tabla.
create index if not exists production_orders_inv_pendiente_idx
  on production_orders (id) where inventario_pendiente;
