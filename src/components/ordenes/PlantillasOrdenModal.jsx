// Modales de las plantillas de Excel de la Orden de Producción (PTZ-OR-01):
//   · BibliotecaCamposModal  → catálogo de marcadores {{id}} con búsqueda y copiar
//   · InstructivoPlantillaModal → guía paso a paso para personalizar
//   · CargarPlantillaModal   → valida el Excel, muestra vista previa con datos de ejemplo y publica
import { useEffect, useMemo, useState } from 'react'
import { Copy, Check, Search, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react'
import Modal from '../ui/Modal'
import { GRUPOS_EXPANDIDOS, LISTAS, INSTRUCTIVO, datosEjemplo } from '../../lib/plantillaCampos'
import { escanearPlantilla, htmlOrdenDesdePlantilla } from '../../lib/plantillaOrden'

const Ico = ({ as: C, size = 14 }) => <C size={size} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} aria-hidden="true" />

const copiar = async (txt) => { try { await navigator.clipboard.writeText(txt); return true } catch { return false } }

function Etiqueta({ estado }) {
  if (estado === 'auto') return <span className="badge badge-verde" title="El sistema lo llena con datos reales de la orden">Automático</span>
  if (estado === 'captura') return <span className="badge badge-azul" title="Lo diligencia el operario en el paso de resultados de la orden («Controles de proceso y calidad»)">Se captura en la orden</span>
  return <span className="badge badge-dorado" title="Aún no se captura en el sistema: se imprime en blanco para escribirlo a mano. El ID ya queda reservado.">Queda en blanco</span>
}

// ───────────────────────── Biblioteca ─────────────────────────
export function BibliotecaCamposModal({ open, onClose }) {
  const [q, setQ] = useState('')
  const [solo, setSolo] = useState('todos')   // todos | auto | blanco
  const [copiado, setCopiado] = useState('')

  const secciones = useMemo(() => {
    const t = q.trim().toLowerCase()
    const filtra = (c) => (solo === 'todos' || c.estado === solo)
      && (!t || `${c.id} ${c.label} ${c.desc}`.toLowerCase().includes(t))
    return [
      ...GRUPOS_EXPANDIDOS.map(g => ({ clave: g.id, titulo: g.titulo, desc: g.desc, tabla: false, campos: g.campos.filter(filtra) })),
      ...LISTAS.map(l => ({ clave: l.prefijo, titulo: `Tabla: ${l.titulo}`, desc: l.desc, tabla: true, campos: l.campos.filter(filtra) })),
    ].filter(s => s.campos.length)
  }, [q, solo])

  const total = secciones.reduce((s, x) => s + x.campos.length, 0)
  const onCopiar = async (id) => { if (await copiar(`{{${id}}}`)) { setCopiado(id); setTimeout(() => setCopiado(c => (c === id ? '' : c)), 1500) } }

  return (
    <Modal open={open} onClose={onClose} title="Biblioteca de campos de la plantilla" size="modal-lg" guard={false}
      footer={<button className="btn btn-secondary" onClick={onClose}>Cerrar</button>}>
      <div className="alert alert-info" style={{ fontSize: '0.83rem' }}>
        Escribe el marcador tal cual (con las dobles llaves) en cualquier celda de tu Excel. Pulsa <b>Copiar</b> para llevarlo al portapapeles.
        Los <b>«Se capturan en la orden»</b> (pH, °Brix, temperaturas, verificaciones…) los diligencia el operario en el paso de resultados. Los <b>«Queda en blanco»</b> son propios de la industria de alimentos que aún no se capturan: se imprimen vacíos para llenarlos a mano.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={14} style={{ position: 'absolute', left: 9, top: 11, color: 'var(--texto-suave)' }} aria-hidden="true" />
          <input className="form-control" style={{ paddingLeft: 30 }} placeholder="Buscar campo (lote, temperatura, ph…)" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        {[['todos', 'Todos'], ['auto', 'Automáticos'], ['captura', 'Se capturan'], ['blanco', 'En blanco']].map(([k, l]) => (
          <button key={k} type="button" className={`btn btn-sm ${solo === k ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSolo(k)}>{l}</button>
        ))}
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--texto-suave)', margin: '0 0 8px' }}>{total} campos</p>
      {secciones.map(s => (
        <div key={s.clave} style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, color: 'var(--selva)', fontSize: '0.9rem' }}>{s.titulo}</div>
          {s.desc && <div style={{ fontSize: '0.75rem', color: 'var(--texto-suave)', marginBottom: 4 }}>{s.desc}</div>}
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Marcador</th><th>Qué es</th><th>Ejemplo</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {s.campos.map(c => (
                  <tr key={c.id}>
                    <td><code style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{`{{${c.id}}}`}</code></td>
                    <td style={{ fontSize: '0.8rem' }}><b>{c.label}</b><div style={{ color: 'var(--texto-suave)' }}>{c.desc}</div></td>
                    <td style={{ fontSize: '0.78rem' }}>{c.ejemplo}</td>
                    <td><Etiqueta estado={c.estado} /></td>
                    <td><button type="button" className="btn btn-xs btn-secondary" onClick={() => onCopiar(c.id)}><Ico as={copiado === c.id ? Check : Copy} size={12} />{copiado === c.id ? 'Copiado' : 'Copiar'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {!secciones.length && <p className="empty-table">Ningún campo coincide con la búsqueda.</p>}
    </Modal>
  )
}

// ───────────────────────── Instructivo ─────────────────────────
export function InstructivoPlantillaModal({ open, onClose, onAbrirBiblioteca }) {
  return (
    <Modal open={open} onClose={onClose} title="Instructivo: personalizar la plantilla de la orden" size="modal-lg" guard={false}
      footer={<>
        {onAbrirBiblioteca && <button className="btn btn-secondary" onClick={onAbrirBiblioteca}>Ver biblioteca de campos</button>}
        <button className="btn btn-primary" onClick={onClose}>Entendido</button>
      </>}>
      {INSTRUCTIVO.map(sec => (
        <div key={sec.titulo} style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, color: 'var(--selva)', marginBottom: 4 }}>{sec.titulo}</div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.85rem', lineHeight: 1.5 }}>
            {sec.items.map((it, i) => <li key={i}>{it}</li>)}
          </ul>
        </div>
      ))}
    </Modal>
  )
}

// ───────────────────────── Cargar plantilla ─────────────────────────
export function CargarPlantillaModal({ file, onClose, onPublicar, publicando, versionActual }) {
  const [estado, setEstado] = useState({ cargando: true, error: '', scan: null, html: '' })

  useEffect(() => {
    if (!file) return
    let vivo = true
    ;(async () => {
      setEstado({ cargando: true, error: '', scan: null, html: '' })
      try {
        if (!/\.xlsx$/i.test(file.name)) throw new Error('El archivo debe ser Excel .xlsx (no .xls ni .xlsm).')
        if (file.size > 5 * 1024 * 1024) throw new Error('El archivo supera los 5 MB.')
        const buf = await file.arrayBuffer()
        const scan = await escanearPlantilla(buf)
        const html = scan.ok ? await htmlOrdenDesdePlantilla(buf, datosEjemplo()) : ''
        if (vivo) setEstado({ cargando: false, error: '', scan, html })
      } catch (e) {
        if (vivo) setEstado({ cargando: false, error: e.message || 'No se pudo leer el archivo.', scan: null, html: '' })
      }
    })()
    return () => { vivo = false }
  }, [file])

  const { cargando, error, scan, html } = estado
  const puede = !!scan?.ok && !cargando && !publicando

  return (
    <Modal open={!!file} onClose={onClose} title="Cargar plantilla de la orden (PTZ-OR-01)" size="modal-lg" guard={false}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose} disabled={publicando}>Cancelar</button>
        <button className="btn btn-primary" disabled={!puede} onClick={onPublicar}>
          <Ico as={Upload} />{publicando ? 'Publicando…' : 'Publicar como plantilla oficial'}
        </button>
      </>}>
      <p style={{ fontSize: '0.85rem', margin: '0 0 8px' }}>Archivo: <b>{file?.name}</b></p>
      {cargando && <p>Analizando la plantilla…</p>}
      {error && <div className="alert alert-danger"><Ico as={AlertTriangle} />{error}</div>}
      {scan && !scan.ok && (
        <div className="alert alert-danger">
          <Ico as={AlertTriangle} />No se encontró ningún marcador válido (como <code>{'{{lote.numero}}'}</code>) en la hoja «{scan.hoja}».
          Descarga la plantilla editable desde «Opciones» y escribe los marcadores en tu diseño.
        </div>
      )}
      {scan?.ok && (
        <>
          <div className="alert alert-success" style={{ fontSize: '0.85rem' }}>
            <Ico as={CheckCircle2} /><b>{scan.conocidos.length}</b> marcadores reconocidos en la hoja «{scan.hoja}» ({scan.nFilas} filas × {scan.nCols} columnas
            {scan.imagenes ? `, ${scan.imagenes} imagen(es) fija(s)` : ''}){scan.listas.length ? ` · tablas: ${scan.listas.join(', ')}` : ''}.
            {versionActual ? <> Reemplazará la plantilla vigente (versión {versionActual}); la anterior queda en el historial de Gestión Documental.</> : null}
          </div>
          {scan.desconocidos.length > 0 && (
            <div className="alert alert-warning" style={{ fontSize: '0.83rem' }}>
              <Ico as={AlertTriangle} /><b>Marcadores que no existen</b> (se imprimirán en blanco): {scan.desconocidos.map(d => <code key={d} style={{ marginRight: 6 }}>{`{{${d}}}`}</code>)}
            </div>
          )}
          {scan.mezcladas.length > 0 && (
            <div className="alert alert-warning" style={{ fontSize: '0.83rem' }}>
              <Ico as={AlertTriangle} />Hay filas que mezclan marcadores de dos tablas distintas ({scan.mezcladas.join('; ')}). Solo se repetirá según la primera tabla.
            </div>
          )}
          <div style={{ fontWeight: 600, margin: '8px 0 4px', fontSize: '0.85rem' }}>Vista previa con datos de ejemplo</div>
          <iframe title="Vista previa de la plantilla" sandbox="" srcDoc={html} style={{ width: '100%', height: 520, border: '1px solid var(--crema-oscuro)', borderRadius: 8, background: '#fff' }} />
        </>
      )}
    </Modal>
  )
}
