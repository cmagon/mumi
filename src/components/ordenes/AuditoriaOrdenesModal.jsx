import Modal from '../ui/Modal'

// Registro de creación de órdenes (auditoría, solo admin). Presentacional: recibe las órdenes y
// la función de numeración visible del componente padre.
export default function AuditoriaOrdenesModal({ open, onClose, ordenes = [], opNum }) {
  return (
    <Modal open={open} onClose={onClose} title="📜 Registro de creación de órdenes" size="modal-lg"
      footer={<button className="btn btn-secondary" onClick={onClose}>Cerrar</button>}
    >
      <div className="alert alert-info" style={{ fontSize: '0.83rem' }}>Auditoría interna: qué usuario creó cada orden y cuándo. Solo visible para administradores.</div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Producto</th><th>Creada por</th><th>Fecha y hora</th></tr></thead>
          <tbody>
            {ordenes.length === 0
              ? <tr><td colSpan={4} className="empty-table">Sin órdenes</td></tr>
              : [...ordenes].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).map(o => (
                <tr key={o.id}>
                  <td>#{opNum(o.id)}</td>
                  <td>{o.producto}</td>
                  <td><strong>{o.creado_por || '—'}</strong></td>
                  <td>{o.created_at ? new Date(o.created_at).toLocaleString('es-CO') : '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
