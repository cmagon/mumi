import Modal from '../ui/Modal'
import { fFecha, fCOP } from '../../lib/businessLogic'

// Detalle de un lote de MP consumido (trazabilidad hacia la compra). Presentacional: los formatos
// de cantidad y de vencimiento se reciben del padre (dependen de sus reglas de unidad).
export default function DetalleLoteMpModal({ data, onClose, fmtCantLote, vencimientoLoteValido, naTraza = 'N.A.' }) {
  return (
    <Modal open={!!data} onClose={onClose} guard={false}
      title={`🧊 Lote "${data?.lote || 's/lote'}" — ${data?.mpNombre || ''}`}
      footer={<button className="btn btn-secondary" onClick={onClose}>Cerrar</button>}>
      {data?.cargando && <p style={{ fontSize: '0.88rem' }}>Cargando detalles del lote…</p>}
      {data && !data.cargando && data.filas.length === 0 && (
        <p className="empty-table">No se encontró este lote en el inventario (pudo haberse eliminado o renombrado).</p>
      )}
      {data && !data.cargando && data.filas.map((lf) => {
        const u = data.unidad
        const consumido = Math.max(0, (lf.cantidad_inicial || 0) - (lf.cantidad_actual || 0) - (lf.cantidad_reservada || 0))
        return (
        <table key={lf.id} style={{ fontSize: '0.88rem', width: '100%', marginBottom: 10 }}>
          <tbody>
            <tr><td style={{ color: 'var(--texto-suave)', width: 190 }}>Fecha de compra/entrada</td><td><strong>{fFecha(lf.fecha_entrada)}</strong></td></tr>
            <tr><td style={{ color: 'var(--texto-suave)' }}>Proveedor</td><td><strong>{String(lf.proveedor || '').trim() || naTraza}</strong></td></tr>
            <tr><td style={{ color: 'var(--texto-suave)' }}>Costo unitario de compra</td><td>{lf.costo_unitario ? `${fCOP(lf.costo_unitario)}${u ? ` por ${u}` : ''}` : '—'}</td></tr>
            <tr><td style={{ color: 'var(--texto-suave)' }}>Cantidad inicial</td><td>{fmtCantLote(lf.cantidad_inicial, u)}</td></tr>
            <tr><td style={{ color: 'var(--texto-suave)' }}>Ya consumido</td><td>{fmtCantLote(consumido, u)}</td></tr>
            <tr><td style={{ color: 'var(--texto-suave)' }}>Reservado (órdenes en proceso)</td><td>{(lf.cantidad_reservada || 0) > 0 ? <strong style={{ color: 'var(--tierra)' }}>{fmtCantLote(lf.cantidad_reservada, u)}</strong> : <span>0 <small style={{ color: 'var(--texto-suave)' }}>(si la orden ya se cerró, su reserva pasó a "consumido")</small></span>}</td></tr>
            <tr><td style={{ color: 'var(--texto-suave)' }}>Disponible hoy</td><td><strong>{fmtCantLote(lf.cantidad_actual, u)}</strong></td></tr>
            <tr><td style={{ color: 'var(--texto-suave)' }}>Vencimiento</td><td>{vencimientoLoteValido(lf.vencimiento) || naTraza}</td></tr>
            <tr><td style={{ color: 'var(--texto-suave)' }}>Registrado por</td><td>{lf.creado_por || '—'}</td></tr>
          </tbody>
        </table>
        )
      })}
    </Modal>
  )
}
