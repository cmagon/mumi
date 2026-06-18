import { useState, useEffect } from 'react'
import { uploadFile } from '../lib/supabase'
import { getConfig, saveConfig, aplicarTema, DEFAULT_CFG } from '../lib/appConfig'
import { useToast } from '../hooks/useToast'

const FUENTES = ['Source Sans 3', 'Playfair Display', 'Arial', 'Georgia', 'Times New Roman', 'Verdana', 'Tahoma', 'Trebuchet MS']

export default function Configuracion() {
  const toast = useToast()
  const [cfg, setCfg] = useState(getConfig())
  const [logoFile, setLogoFile] = useState(null)
  const [logoPrev, setLogoPrev] = useState(getConfig().logo_url || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => { const c = getConfig(); setCfg(c); setLogoPrev(c.logo_url || '') }, [])

  const set = (k, v) => setCfg(c => ({ ...c, [k]: v }))
  // Vista previa en vivo de colores/fuente
  useEffect(() => { aplicarTema(cfg) }, [cfg.color_primario, cfg.color_dorado, cfg.color_acento, cfg.fuente])

  const guardar = async () => {
    setSaving(true)
    try {
      let logo_url = cfg.logo_url
      if (logoFile) {
        const ext = logoFile.name.split('.').pop()
        logo_url = await uploadFile('documentos', `branding/logo_${Date.now()}.${ext}`, logoFile)
      }
      await saveConfig({ ...cfg, logo_url })
      setCfg(c => ({ ...c, logo_url })); setLogoFile(null)
      toast('Configuración guardada ✓')
    } catch (e) { toast(e.message, 'error') } finally { setSaving(false) }
  }

  const restaurar = () => { setCfg({ ...DEFAULT_CFG }); setLogoPrev(''); setLogoFile(null); aplicarTema(DEFAULT_CFG); toast('Valores por defecto cargados — pulsa Guardar', 'info') }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">⚙️ Configuración & Personalización</h1>
        <div className="page-actions" style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={restaurar}>↺ Restaurar</button>
          <button className="btn btn-primary btn-sm" onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : '💾 Guardar'}</button>
        </div>
      </div>

      <div className="grid-resp" style={{ gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Datos de la empresa */}
        <div className="card">
          <div className="card-title">🏢 Datos de la empresa</div>
          <div className="form-group"><label className="form-label">Nombre de la empresa</label><input className="form-control" value={cfg.empresa} onChange={e => set('empresa', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Eslogan / subtítulo</label><input className="form-control" value={cfg.eslogan} onChange={e => set('eslogan', e.target.value)} /></div>
          <div className="form-grid-2">
            <div className="form-group"><label className="form-label">NIT</label><input className="form-control" value={cfg.nit} onChange={e => set('nit', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Teléfono</label><input className="form-control" value={cfg.telefono} onChange={e => set('telefono', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Ciudad</label><input className="form-control" value={cfg.ciudad} onChange={e => set('ciudad', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Correo</label><input className="form-control" value={cfg.email} onChange={e => set('email', e.target.value)} /></div>
          </div>
          <div className="form-group"><label className="form-label">Dirección</label><input className="form-control" value={cfg.direccion} onChange={e => set('direccion', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Sitio web</label><input className="form-control" value={cfg.web} onChange={e => set('web', e.target.value)} /></div>
        </div>

        {/* Logo + apariencia */}
        <div className="card">
          <div className="card-title">🖼️ Logo (impresiones)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
            <div style={{ width: 100, height: 100, border: '1px dashed var(--crema-oscuro)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#fff' }}>
              {logoPrev ? <img src={logoPrev} alt="logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: '2rem', opacity: 0.4 }}>🌿</span>}
            </div>
            <div>
              <input type="file" accept="image/*" onChange={e => { const f = e.target.files[0]; if (f) { setLogoFile(f); setLogoPrev(URL.createObjectURL(f)) } }} />
              <div style={{ fontSize: '0.75rem', color: 'var(--texto-suave)', marginTop: 4 }}>Se usará en todas las impresiones (órdenes, formatos, reportes).</div>
              {logoPrev && <button className="btn btn-xs btn-danger" style={{ marginTop: 6 }} onClick={() => { setLogoFile(null); setLogoPrev(''); set('logo_url', '') }}>Quitar logo</button>}
            </div>
          </div>

          <div className="card-title" style={{ fontSize: '0.95rem' }}>🎨 Colores y fuente</div>
          <div className="form-grid-2">
            <div className="form-group"><label className="form-label">Color primario</label><input type="color" className="form-control" style={{ height: 40, padding: 4 }} value={cfg.color_primario} onChange={e => set('color_primario', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Color dorado/acento</label><input type="color" className="form-control" style={{ height: 40, padding: 4 }} value={cfg.color_dorado} onChange={e => set('color_dorado', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Color secundario</label><input type="color" className="form-control" style={{ height: 40, padding: 4 }} value={cfg.color_acento} onChange={e => set('color_acento', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Fuente</label>
              <select className="form-control" value={cfg.fuente} onChange={e => set('fuente', e.target.value)}>
                {FUENTES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 8, padding: 12, borderRadius: 8, background: cfg.color_primario, color: '#fff', fontFamily: `'${cfg.fuente}', sans-serif` }}>
            <strong style={{ color: cfg.color_dorado }}>{cfg.empresa}</strong> — vista previa de tema · <span style={{ color: cfg.color_acento }}>texto acento</span>
          </div>
        </div>
      </div>

      <div className="alert alert-info" style={{ fontSize: '0.82rem', marginTop: 12 }}>
        Los colores y la fuente se aplican en vivo a toda la aplicación. El <strong>logo y los datos de la empresa</strong> se usan en las impresiones. Pulsa <strong>Guardar</strong> para que apliquen a todos los usuarios.
      </div>
    </div>
  )
}
