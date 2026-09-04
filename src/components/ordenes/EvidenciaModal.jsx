import Modal from '../ui/Modal'

// Modal para adjuntar la evidencia (escaneo firmado o firma digital) de una orden impresa.
// Presentacional/controlado: el estado y la confirmación viven en el componente padre.
export default function EvidenciaModal({
  open, evidOrden, savingEvid, evidFile, setEvidFile, firmaDigital, setFirmaDigital, onClose, onConfirm,
}) {
  return (
    <Modal open={open} onClose={onClose} title="📎 Evidencia de la orden impresa"
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Más tarde</button>
        <button className="btn btn-primary" onClick={onConfirm} disabled={savingEvid}>{savingEvid ? 'Guardando...' : 'Registrar evidencia'}</button>
      </>}>
      <div className="alert alert-info" style={{ fontSize: '0.85rem' }}>
        Imprimiste la <strong>Orden OP-{evidOrden?.id}</strong>. Para dejar la trazabilidad completa (BPM), adjunta el <strong>formato escaneado y firmado</strong> o registra la <strong>firma digital</strong>.
      </div>
      <div className="form-group">
        <label className="form-label">📄 Archivo escaneado y firmado</label>
        <input type="file" accept="image/*,.pdf" onChange={e => setEvidFile(e.target.files[0] || null)} />
        {evidFile && <div style={{ fontSize: '0.8rem', color: 'var(--selva)', marginTop: 4 }}>📎 {evidFile.name}</div>}
      </div>
      <div style={{ textAlign: 'center', color: 'var(--texto-suave)', fontSize: '0.8rem', margin: '6px 0' }}>— o —</div>
      <div className="form-group">
        <label className="form-label">✍ Firma digital (nombre de quien firma)</label>
        <input className="form-control" value={firmaDigital} onChange={e => setFirmaDigital(e.target.value)} placeholder="Ej: Juan Pérez — Operario" />
        <small style={{ color: 'var(--texto-suave)' }}>Quedará registrado con tu usuario y la fecha/hora como firma electrónica.</small>
      </div>
    </Modal>
  )
}
