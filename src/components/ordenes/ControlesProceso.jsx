// Controles de proceso y calidad que el operario diligencia en la orden (opcional).
// Se guardan en production_orders.controles ({ id: valor }) y salen en la plantilla PTZ-OR-01
// con los marcadores {{calidad.ph}}, {{check.despeje_linea}}, etc. (ver plantillaCampos.js).
import { ClipboardCheck } from 'lucide-react'
import { capturaParaFormulario } from '../../lib/plantillaCampos'

const GRUPOS_FORM = capturaParaFormulario()

// Quita vacíos/nulos antes de guardar
export const limpiarControles = (obj) => Object.fromEntries(
  Object.entries(obj || {}).filter(([, v]) => v === true || v === false || (v != null && String(v).trim() !== ''))
)
export const contarControles = (obj) => Object.keys(limpiarControles(obj)).length

export default function ControlesProceso({ valores, onChange, SiNo, disabled = false }) {
  const val = valores || {}
  const total = contarControles(val)
  const set = (id, v) => onChange({ ...val, [id]: v })

  return (
    <details className="acordeon-item" style={{ marginTop: 10 }}>
      <summary>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--selva)' }}>
          <ClipboardCheck size={15} aria-hidden="true" /> Controles de proceso y calidad
          <small style={{ fontWeight: 400, color: 'var(--texto-suave)' }}>(opcional{total ? ` · ${total} diligenciado${total === 1 ? '' : 's'}` : ''})</small>
        </span>
      </summary>
      <div style={{ padding: '6px 4px 2px' }}>
        <small style={{ color: 'var(--texto-suave)', fontSize: '0.74rem', display: 'block', marginBottom: 6 }}>
          Lo que llenes aquí se guarda en la orden y sale en la plantilla oficial. Deja en blanco lo que no apliquen.
        </small>
        {GRUPOS_FORM.map(g => (
          <div key={g.titulo} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--selva)', marginBottom: 4 }}>{g.titulo}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>
              {g.campos.map(c => (
                <div key={c.id} className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.74rem' }}>{c.label}{c.unidad ? ` (${c.unidad})` : ''}</label>
                  {c.tipo === 'sino'
                    ? <div><SiNo value={typeof val[c.id] === 'boolean' ? val[c.id] : null} onChange={v => set(c.id, v)} />
                        {typeof val[c.id] === 'boolean' && !disabled && <button type="button" className="btn btn-xs btn-secondary" style={{ marginLeft: 6 }} onClick={() => { const n = { ...val }; delete n[c.id]; onChange(n) }}>Quitar</button>}
                      </div>
                    : <input className="form-control" disabled={disabled} value={val[c.id] ?? ''}
                        inputMode={c.tipo === 'numero' ? 'decimal' : 'text'} maxLength={120}
                        onChange={e => set(c.id, e.target.value)} />}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}
