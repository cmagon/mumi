import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../hooks/useToast'
import { supabase } from '../lib/supabase'
import Modal from './ui/Modal'

export default function ChangePasswordModal({ open, onClose }) {
  const { changePassword, user, profile } = useAuth()
  const toast = useToast()
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [saving, setSaving] = useState(false)

  // Solo los admin gestionan un correo de recuperación (los logins son sintéticos @mumi.internal).
  const esAdmin = (profile?.rol === 'admin') || (profile?._rolReal === 'admin')
  const [correo, setCorreo] = useState('')
  const [savingCorreo, setSavingCorreo] = useState(false)
  useEffect(() => { if (open) setCorreo(profile?.email_recuperacion || '') }, [open, profile?.email_recuperacion])

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

  const guardarCorreo = async () => {
    const val = correo.trim()
    if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { toast('Escribe un correo válido', 'warning'); return }
    setSavingCorreo(true)
    try {
      const { error } = await supabase.from('user_profiles').update({ email_recuperacion: val || null }).eq('id', user.id)
      if (error) throw error
      toast(val ? 'Correo de recuperación guardado ✓' : 'Correo de recuperación eliminado')
    } catch (e) {
      toast(e.message || 'No se pudo guardar el correo', 'error')
    } finally { setSavingCorreo(false) }
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

      {esAdmin && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--borde, #e5e0d5)' }}>
          <label className="form-label">Correo de recuperación</label>
          <small style={{ display: 'block', color: 'var(--texto-suave, #888)', fontSize: '0.75rem', margin: '0 0 6px' }}>
            Correo real donde recibirás el código si olvidas tu contraseña.
          </small>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="email" className="form-control" value={correo} onChange={e => setCorreo(e.target.value)}
              placeholder="tucorreo@ejemplo.com" autoComplete="email" style={{ flex: 1 }} />
            <button className="btn btn-secondary" onClick={guardarCorreo} disabled={savingCorreo}>{savingCorreo ? '...' : 'Guardar'}</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
