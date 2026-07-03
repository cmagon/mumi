import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../hooks/useToast'
import Modal from './ui/Modal'

export default function ChangePasswordModal({ open, onClose }) {
  const { changePassword } = useAuth()
  const toast = useToast()
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [saving, setSaving] = useState(false)

  const guardar = async () => {
    if (p1.length < 8) { toast('La contraseña debe tener al menos 8 caracteres', 'warning'); return }
    if (p1 !== p2) { toast('Las contraseñas no coinciden', 'warning'); return }
    setSaving(true)
    try {
      await changePassword(p1)
      toast('Contraseña actualizada ✓')
      setP1(''); setP2(''); onClose()
    } catch (e) {
      toast(e.message || 'Error al cambiar la contraseña', 'error')
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="🔑 Cambiar mi contraseña"
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
      </>}
    >
      <div className="form-group"><label className="form-label">Nueva contraseña</label>
        <input type="password" className="form-control" value={p1} onChange={e => setP1(e.target.value)} autoComplete="new-password" /></div>
      <div className="form-group"><label className="form-label">Repetir contraseña</label>
        <input type="password" className="form-control" value={p2} onChange={e => setP2(e.target.value)} autoComplete="new-password" /></div>
    </Modal>
  )
}
