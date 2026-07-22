import { useState, useEffect } from 'react'
import { uploadFile } from '../lib/supabase'
import { getConfig, saveConfig, aplicarTema, DEFAULT_CFG, PALETAS } from '../lib/appConfig'
import { useToast } from '../hooks/useToast'
import { Settings, Building2, Palette, Leaf, Upload, RotateCcw, Save, Trash2 } from 'lucide-react'
import Select from '../components/ui/Select'
const Ico = ({ as: C, size = 15 }) => <C size={size} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} aria-hidden="true" />

// Fuentes agrupadas para el selector. Las Google Fonts se importan en globals.css.
const GRUPOS_FUENTES = [
  { grupo: 'Sistema', fuentes: ['Arial', 'Georgia', 'Times New Roman', 'Verdana', 'Tahoma', 'Trebuchet MS'] },
  { grupo: 'Google · Sans', fuentes: ['Source Sans 3', 'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Nunito', 'Raleway', 'Work Sans', 'DM Sans', 'Manrope', 'Rubik', 'Quicksand', 'Josefin Sans'] },
  { grupo: 'Google · Display', fuentes: ['Oswald', 'Bebas Neue'] },
  { grupo: 'Google · Serif', fuentes: ['Playfair Display', 'Merriweather', 'Lora', 'PT Serif', 'Roboto Slab', 'Cormorant Garamond'] },
]
const OpcionesFuentes = () => GRUPOS_FUENTES.map(g => (
  <optgroup key={g.grupo} label={g.grupo}>
    {g.fuentes.map(f => <option key={f} value={f} style={{ fontFamily: `'${f}', sans-serif` }}>{f}</option>)}
  </optgroup>
))

export default function Configuracion() {
  const toast = useToast()
  const [cfg, setCfg] = useState(getConfig())
  const [logoFile, setLogoFile] = useState(null)
  const [logoPrev, setLogoPrev] = useState(getConfig().logo_url || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => { const c = getConfig(); setCfg(c); setLogoPrev(c.logo_url || '') }, [])

  const set = (k, v) => setCfg(c => ({ ...c, [k]: v }))
  // Aplica una plantilla de paleta completa (colores + fuente). La vista previa en vivo
  // ya se dispara por el useEffect de abajo; solo se persiste al pulsar «Guardar».
  const usarPaleta = (p) => setCfg(c => ({ ...c, color_primario: p.primario, color_dorado: p.dorado, color_acento: p.acento, fuente: p.fuente, fuente_titulos: p.titulos || c.fuente_titulos }))
  const paletaActiva = PALETAS.find(p => p.primario.toLowerCase() === (cfg.color_primario || '').toLowerCase() && p.dorado.toLowerCase() === (cfg.color_dorado || '').toLowerCase() && p.acento.toLowerCase() === (cfg.color_acento || '').toLowerCase())
  // Vista previa en vivo de colores/fuentes
  useEffect(() => { aplicarTema(cfg) }, [cfg.color_primario, cfg.color_dorado, cfg.color_acento, cfg.fuente, cfg.fuente_titulos])

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
        <h1 className="page-title"><Ico as={Settings} size={14} />Configuración & Personalización</h1>
        <div className="page-actions" style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={restaurar}><Ico as={RotateCcw} /> Restaurar</button>
          <button className="btn btn-primary btn-sm" onClick={guardar} disabled={saving}><Ico as={Save} /> {saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>

      {/* Datos de la empresa + Logo */}
      <div className="card">
        <div className="card-title"><Ico as={Building2} size={17} />Datos de la empresa</div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Logo, junto al nombre */}
          <div style={{ flex: '0 0 auto', textAlign: 'center' }}>
            <label className="form-label" style={{ display: 'block' }}>Logo</label>
            <div style={{ width: 120, height: 120, border: '1px dashed var(--crema-oscuro)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#fff', margin: '0 auto 8px' }}>
              {logoPrev ? <img src={logoPrev} alt="logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <Leaf size={38} aria-hidden="true" style={{ opacity: 0.35, color: 'var(--selva)' }} />}
            </div>
            <input id="logo-file" type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) { setLogoFile(f); setLogoPrev(URL.createObjectURL(f)) } }} />
            <label htmlFor="logo-file" className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}><Ico as={Upload} /> Subir logo</label>
            {logoPrev && <button type="button" className="btn btn-xs btn-danger" style={{ marginTop: 6, display: 'inline-flex', width: '100%', justifyContent: 'center' }} onClick={() => { setLogoFile(null); setLogoPrev(''); set('logo_url', '') }}><Ico as={Trash2} size={13} /> Quitar</button>}
            <div style={{ fontSize: '0.72rem', color: 'var(--texto-suave)', marginTop: 6, maxWidth: 120 }}>Se usa en el header y las impresiones.</div>
          </div>

          {/* Nombre + demás datos */}
          <div style={{ flex: '1 1 320px', minWidth: 260 }}>
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
        </div>
      </div>

      {/* Apariencia: colores + fuentes + plantillas (abajo del todo) */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-title"><Ico as={Palette} size={17} />Apariencia — colores, fuentes y plantillas</div>

        {/* Colores + fuentes manuales */}
        <div className="form-grid-2">
          <div className="form-group"><label className="form-label">Color primario</label><input type="color" className="form-control" style={{ height: 40, padding: 4 }} value={cfg.color_primario} onChange={e => set('color_primario', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Color dorado/acento</label><input type="color" className="form-control" style={{ height: 40, padding: 4 }} value={cfg.color_dorado} onChange={e => set('color_dorado', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Color secundario</label><input type="color" className="form-control" style={{ height: 40, padding: 4 }} value={cfg.color_acento} onChange={e => set('color_acento', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Fuente principal (texto)</label>
            <Select className="form-control" style={{ fontFamily: `'${cfg.fuente}', sans-serif` }} value={cfg.fuente} onChange={e => set('fuente', e.target.value)}>
              <OpcionesFuentes />
            </Select>
          </div>
          <div className="form-group"><label className="form-label">Fuente secundaria (títulos)</label>
            <Select className="form-control" style={{ fontFamily: `'${cfg.fuente_titulos}', serif` }} value={cfg.fuente_titulos} onChange={e => set('fuente_titulos', e.target.value)}>
              <OpcionesFuentes />
            </Select>
          </div>
        </div>

        {/* Vista previa */}
        <div style={{ marginTop: 4, marginBottom: 18, padding: 14, borderRadius: 8, background: cfg.color_primario, color: '#fff' }}>
          <div style={{ fontFamily: `'${cfg.fuente_titulos}', serif`, fontSize: '1.3rem', color: cfg.color_dorado, marginBottom: 2 }}>{cfg.empresa || 'Mumi Amazonia'}</div>
          <div style={{ fontFamily: `'${cfg.fuente}', sans-serif`, fontSize: '0.9rem' }}>Vista previa de tema · <span style={{ color: cfg.color_acento }}>texto acento</span></div>
        </div>

        {/* Plantillas de tema */}
        <div className="card-title" style={{ fontSize: '0.95rem' }}>Plantillas rápidas</div>
        <p style={{ fontSize: '0.82rem', color: 'var(--texto-suave)', marginTop: -4, marginBottom: 14 }}>
          Elige una paleta prediseñada; se aplica al instante en toda la app y actualiza los colores y la fuente de arriba. Pulsa <strong>Guardar</strong> para dejarla fija.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {PALETAS.map(p => {
            const activa = paletaActiva?.id === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => usarPaleta(p)}
                title={p.desc}
                style={{
                  textAlign: 'left', cursor: 'pointer', padding: 12, borderRadius: 12,
                  background: 'var(--blanco)', transition: 'var(--transicion)',
                  border: activa ? '2px solid var(--selva)' : '1px solid var(--crema-oscuro)',
                  boxShadow: activa ? 'var(--sombra)' : 'none',
                }}
              >
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  <span style={{ flex: 2, height: 34, borderRadius: 6, background: p.primario }} />
                  <span style={{ flex: 1, height: 34, borderRadius: 6, background: p.dorado }} />
                  <span style={{ flex: 1, height: 34, borderRadius: 6, background: p.acento }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <strong style={{ fontSize: '0.9rem', color: 'var(--texto)' }}>{p.nombre}</strong>
                  {activa && <span style={{ fontSize: '0.7rem', color: 'var(--selva)', fontWeight: 700 }}>✓ Activa</span>}
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--texto-suave)', marginTop: 2 }}>{p.desc}</div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="alert alert-info" style={{ fontSize: '0.82rem', marginTop: 12 }}>
        Los colores y las fuentes se aplican en vivo a toda la aplicación. El <strong>logo y los datos de la empresa</strong> se usan en el header y las impresiones. Pulsa <strong>Guardar</strong> para que apliquen a todos los usuarios.
      </div>
    </div>
  )
}
