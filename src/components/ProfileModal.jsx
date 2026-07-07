import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../hooks/useToast'
import { supabase, uploadFile } from '../lib/supabase'
import Modal from './ui/Modal'
import { User, Camera } from 'lucide-react'

// "Mi perfil / Configuración" — el usuario edita sus datos básicos y su contraseña.
// Los datos personales (teléfono, correo, dirección, nacimiento, foto) viven en la ficha de
// EMPLEADO vinculada por nombre. Si el usuario no tiene ficha (p. ej. un admin), solo se
// permite cambiar la contraseña.
export default function ProfileModal({ open, onClose }) {
  const { profile, changePassword } = useAuth()
  const toast = useToast()
  const [emp, setEmp] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ telefono: '', correo: '', direccion: '', fecha_nacimiento: '', foto_url: '' })
  const [fotoFile, setFotoFile] = useState(null)
  const [fotoPrev, setFotoPrev] = useState('')
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')

  useEffect(() => {
    if (!open || !profile?.nombre) return
    setCargando(true); setP1(''); setP2(''); setFotoFile(null)
    supabase.from('employees').select('*').eq('nombre', profile.nombre).maybeSingle()
      .then(({ data }) => {
        setEmp(data || null)
        setForm({
          telefono: data?.telefono || '', correo: data?.correo || '',
          direccion: data?.direccion || '', fecha_nacimiento: data?.fecha_nacimiento || '',
          foto_url: data?.foto_url || '',
        })
        setFotoPrev(data?.foto_url || '')
      })
      .catch(() => setEmp(null))
      .finally(() => setCargando(false))
  }, [open, profile?.nombre])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const guardar = async () => {
    setSaving(true)
    try {
      // 1) Datos personales (solo si tiene ficha de empleado)
      if (emp) {
        let foto_url = form.foto_url
        if (fotoFile) {
          const ext = fotoFile.name.split('.').pop()
          foto_url = await uploadFile('documentos', `empleados/foto_${emp.id}_${Date.now()}.${ext}`, fotoFile)
        }
        const { error } = await supabase.from('employees').update({
          telefono: form.telefono || null, correo: form.correo || null,
          direccion: form.direccion || null, fecha_nacimiento: form.fecha_nacimiento || null,
          foto_url: foto_url || null,
        }).eq('id', emp.id)
        if (error) throw error
      }
      // 2) Contraseña (opcional)
      if (p1 || p2) {
        if (p1.length < 8) { toast('La contraseña debe tener al menos 8 caracteres', 'warning'); setSaving(false); return }
        if (p1 !== p2) { toast('Las contraseñas no coinciden', 'warning'); setSaving(false); return }
        await changePassword(p1)
      }
      toast('Datos actualizados ✓')
      onClose()
    } catch (e) {
      toast(e.message || 'No se pudo guardar', 'error')
    } finally { setSaving(false) }
  }

  if (!open) return null

  return (
    <Modal open onClose={onClose} guard={false}
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><User size={18} aria-hidden="true" /> Mi perfil</span>}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={guardar} disabled={saving || cargando}>{saving ? 'Guardando…' : 'Guardar'}</button>
      </>}
    >
      <div style={{ marginBottom: 12 }}>
        <strong style={{ color: 'var(--selva)' }}>{profile?.nombre}</strong>
      </div>

      {cargando ? <p className="empty-table">Cargando…</p> : (
        <>
          {emp ? (
            <>
              {/* Foto */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
                <div style={{ width: 84, height: 84, borderRadius: '50%', overflow: 'hidden', background: 'var(--crema)', border: '1px solid var(--crema-oscuro)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {fotoPrev ? <img src={fotoPrev} alt="foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <User size={38} aria-hidden="true" style={{ color: 'var(--texto-suave)' }} />}
                </div>
                <div>
                  <input id="perfil-foto" type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) { setFotoFile(f); setFotoPrev(URL.createObjectURL(f)) } }} />
                  <label htmlFor="perfil-foto" className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}><Camera size={14} aria-hidden="true" /> Cambiar foto</label>
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group"><label className="form-label">Teléfono</label><input className="form-control" value={form.telefono} onChange={e => set('telefono', e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Correo electrónico</label><input type="email" className="form-control" value={form.correo} onChange={e => set('correo', e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Fecha de nacimiento</label><input type="date" className="form-control" value={form.fecha_nacimiento || ''} onChange={e => set('fecha_nacimiento', e.target.value)} /></div>
              </div>
              <div className="form-group"><label className="form-label">Dirección</label><input className="form-control" value={form.direccion} onChange={e => set('direccion', e.target.value)} /></div>
            </>
          ) : (
            <div className="alert alert-info" style={{ fontSize: '0.82rem' }}>No tienes una ficha de empleado vinculada, así que aquí solo puedes cambiar tu contraseña.</div>
          )}

          {/* Cambiar contraseña */}
          <div className="card-title" style={{ fontSize: '0.95rem', marginTop: 8 }}>Cambiar contraseña</div>
          <p style={{ fontSize: '0.78rem', color: 'var(--texto-suave)', marginTop: -8, marginBottom: 10 }}>Déjalo en blanco si no quieres cambiarla.</p>
          <div className="form-grid-2">
            <div className="form-group"><label className="form-label">Nueva contraseña</label><input type="password" className="form-control" value={p1} onChange={e => setP1(e.target.value)} autoComplete="new-password" /></div>
            <div className="form-group"><label className="form-label">Repetir contraseña</label><input type="password" className="form-control" value={p2} onChange={e => setP2(e.target.value)} autoComplete="new-password" /></div>
          </div>
        </>
      )}
    </Modal>
  )
}
