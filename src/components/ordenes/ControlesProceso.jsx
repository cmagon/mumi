// Controles de proceso, calidad y trazabilidad que el operario diligencia en la orden (opcional).
// Se guardan en production_orders.controles ({ id: valor }) y salen en la plantilla PTZ-OR-01
// con los marcadores {{calidad.ph}}, {{check.despeje_linea}}, {{nc.descripcion}}, etc.
// (ver plantillaCampos.js → CAPTURA_UI).
import { ClipboardCheck } from 'lucide-react'
import { capturaParaFormulario } from '../../lib/plantillaCampos'

const GRUPOS_FORM = capturaParaFormulario()

const lleno = (v) => v === true || v === false || (v != null && String(v).trim() !== '')

// Quita vacíos/nulos antes de guardar
export const limpiarControles = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => lleno(v)))
export const contarControles = (obj) => Object.keys(limpiarControles(obj)).length

export default function ControlesProceso({ valores, onChange, SiNo, disabled = false }) {
  const val = valores || {}
  const total = contarControles(val)
  const set = (id, v) => onChange({ ...val, [id]: v })

  return (
    <details className="acordeon-item" style={{ marginTop: 10 }}>
      <summary>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--selva)' }}>
          <ClipboardCheck size={15} aria-hidden="true" /> Controles de proceso, calidad y trazabilidad
          <small style={{ fontWeight: 400, color: 'var(--texto-suave)' }}>(opcional{total ? ` · ${total} diligenciado${total === 1 ? '' : 's'}` : ''})</small>
        </span>
      </summary>
      <div style={{ padding: '6px 4px 2px' }}>
        <small style={{ color: 'var(--texto-suave)', fontSize: '0.74rem', display: 'block', marginBottom: 6 }}>
          Lo que llenes aquí se guarda en la orden y sale en la plantilla oficial. Abre cada grupo y deja en blanco lo que no aplique.
        </small>
        {GRUPOS_FORM.map(g => {
          const n = g.campos.filter(c => lleno(val[c.id])).length
          return (
            <details key={g.titulo} style={{ marginBottom: 6, border: '1px solid var(--crema-oscuro)', borderRadius: 8, padding: '4px 10px' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.83rem', fontWeight: 700, color: 'var(--selva)', padding: '4px 0' }}>
                {g.titulo} {n > 0 && <span className="badge badge-verde" style={{ marginLeft: 6 }}>{n}</span>}
              </summary>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8, padding: '6px 0 8px' }}>
                {g.campos.map(c => (
                  <div key={c.id} className="form-group" style={{ margin: 0, ...(c.largo ? { gridColumn: '1 / -1' } : {}) }}>
                    <label className="form-label" style={{ fontSize: '0.74rem' }}>{c.label}{c.unidad ? ` (${c.unidad})` : ''}</label>
                    {c.tipo === 'sino'
                      ? <div>
                          <SiNo value={typeof val[c.id] === 'boolean' ? val[c.id] : null} onChange={v => set(c.id, v)} />
                          {typeof val[c.id] === 'boolean' && !disabled && (
                            <button type="button" className="btn btn-xs btn-secondary" style={{ marginLeft: 6 }}
                              onClick={() => { const nv = { ...val }; delete nv[c.id]; onChange(nv) }}>Quitar</button>
                          )}
                        </div>
                      : c.largo
                        ? <textarea className="form-control" rows={2} disabled={disabled} maxLength={600} value={val[c.id] ?? ''} onChange={e => set(c.id, e.target.value)} />
                        : <input className="form-control" disabled={disabled} value={val[c.id] ?? ''} maxLength={160}
                            type={c.tipo === 'fecha' ? 'date' : 'text'} inputMode={c.tipo === 'numero' ? 'decimal' : undefined}
                            onChange={e => set(c.id, e.target.value)} />}
                  </div>
                ))}
              </div>
            </details>
          )
        })}
      </div>
    </details>
  )
}
