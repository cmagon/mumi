// Configuración → Respaldo y migración de la base de datos (solo administradores).
// Exporta datos + esquema + archivos de Storage a ZIP, e importa esos ZIP en otro proyecto.
// Requiere la migración supabase/migration_v184_respaldo_migracion.sql.
import { useEffect, useRef, useState } from 'react'
import { Database, Download, Upload, AlertTriangle, CheckCircle2, X, FileArchive, RefreshCw, BookOpen } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../hooks/useToast'
import { crearApi, exportarDatos, exportarArchivos, descargarArchivoNavegador } from '../../lib/respaldo/exportar'
import { leerPaquete, importarDatos, importarArchivos } from '../../lib/respaldo/importar'

const Ico = ({ as: C, size = 16 }) => <C size={size} style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} aria-hidden="true" />
const api = crearApi(supabase)
const URL_ACTUAL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
const fmt = (n) => Number(n || 0).toLocaleString('es-CO')

function Barra({ progreso, onCancelar }) {
  if (!progreso) return null
  const pct = progreso.total ? Math.min(100, Math.round((progreso.hechas / progreso.total) * 100)) : (progreso.porcentaje ?? null)
  return (
    <div style={{ margin: '10px 0', padding: 10, border: '1px solid var(--crema-oscuro)', borderRadius: 8 }}>
      <div style={{ fontSize: '0.82rem', marginBottom: 6 }}>
        {progreso.mensaje || (progreso.tabla ? `Tabla ${progreso.tabla}${progreso.filas != null ? ` · ${fmt(progreso.filas)} filas` : ''}` : progreso.nombre || 'Trabajando…')}
        {progreso.total ? ` — ${progreso.hechas}/${progreso.total}` : ''}
      </div>
      <div style={{ height: 8, background: 'var(--crema-oscuro)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct ?? 100}%`, background: 'var(--selva)', transition: 'width .2s', opacity: pct == null ? 0.5 : 1 }} />
      </div>
      {onCancelar && <button type="button" className="btn btn-xs btn-secondary" style={{ marginTop: 8 }} onClick={onCancelar}><Ico as={X} size={12} />Cancelar</button>}
    </div>
  )
}

export default function RespaldoMigracion() {
  const toast = useToast()
  const [estado, setEstado] = useState({ cargando: true, error: '', cat: null })
  const [progreso, setProgreso] = useState(null)
  const [ocupado, setOcupado] = useState('')           // '' | 'exportar' | 'archivos' | 'importar'
  const cancelar = useRef(false)
  const [resultadoExp, setResultadoExp] = useState(null)
  const [paquetes, setPaquetes] = useState([])         // [{ nombre, zip, manifest }]
  const [modo, setModo] = useState('omitir')
  const [conUsuarios, setConUsuarios] = useState(false)
  const [confirmacion, setConfirmacion] = useState('')
  const [resultadoImp, setResultadoImp] = useState(null)
  const [errorImp, setErrorImp] = useState('')
  const inputRef = useRef(null)

  const verificar = async () => {
    setEstado({ cargando: true, error: '', cat: null })
    const { data, error } = await api.rpc('respaldo_catalogo')
    if (error) {
      const noExiste = /respaldo_catalogo|does not exist|Could not find/i.test(error.message || '')
      setEstado({ cargando: false, cat: null, error: noExiste ? 'FALTA_MIGRACION' : (error.message || 'Error') })
    } else setEstado({ cargando: false, error: '', cat: data })
  }
  useEffect(() => { verificar() }, [])

  const cat = estado.cat
  const totalFilas = cat ? Object.values(cat.filas || {}).reduce((s, n) => s + Number(n || 0), 0) : 0
  const cancelado = () => cancelar.current
  const empezar = (tipo) => { cancelar.current = false; setOcupado(tipo); setProgreso({ mensaje: 'Iniciando…' }) }
  const terminar = () => { setOcupado(''); setProgreso(null) }

  // ── Exportar datos + esquema ──
  const onExportar = async () => {
    empezar('exportar'); setResultadoExp(null)
    try {
      const r = await exportarDatos({ api, origenUrl: URL_ACTUAL, onProgreso: setProgreso, cancelado })
      descargarArchivoNavegador(r.blob, r.nombre)
      setResultadoExp({ ok: true, manifest: r.manifest, nombre: r.nombre, bytes: r.blob.size })
      toast('Respaldo generado ✓ Guarda el ZIP en un lugar privado')
    } catch (e) { setResultadoExp({ ok: false, error: e.message }); toast(e.message, e.message.includes('Cancelado') ? 'warning' : 'error') }
    finally { terminar() }
  }

  // ── Exportar archivos de un bucket ──
  const onExportarBucket = async (bucket) => {
    empezar('archivos'); setResultadoExp(null)
    try {
      const r = await exportarArchivos({
        api, bucket, origenUrl: URL_ACTUAL, onProgreso: setProgreso, cancelado,
        onParte: async ({ blob, nombre }) => { descargarArchivoNavegador(blob, nombre); await new Promise(res => setTimeout(res, 800)) },
      })
      setResultadoExp({ ok: true, archivos: r, bucket })
      toast(`Archivos de «${bucket}»: ${r.exportados}/${r.total} exportados en ${r.partes} ZIP`, r.fallidos.length ? 'warning' : undefined)
    } catch (e) { setResultadoExp({ ok: false, error: e.message }); toast(e.message, e.message.includes('Cancelado') ? 'warning' : 'error') }
    finally { terminar() }
  }

  // ── Importar ──
  const onElegir = async (e) => {
    const files = [...(e.target.files || [])]; e.target.value = ''
    const nuevos = []
    for (const f of files) {
      try { const p = await leerPaquete(f); nuevos.push({ nombre: f.name, ...p }) }
      catch (err) { toast(`${f.name}: ${err.message}`, 'error') }
    }
    setPaquetes(p => [...p, ...nuevos].sort((a, b) => (a.manifest.tipo === 'datos' ? -1 : 1) - (b.manifest.tipo === 'datos' ? -1 : 1)))
    setResultadoImp(null); setErrorImp('')
  }
  const quitar = (i) => setPaquetes(p => p.filter((_, k) => k !== i))
  const origenes = [...new Set(paquetes.map(p => (p.manifest.origen || '').replace(/\/+$/, '')).filter(Boolean))]
  const mismoProyecto = origenes.includes(URL_ACTUAL)

  const onImportar = async () => {
    empezar('importar'); setResultadoImp(null); setErrorImp('')
    const res = { datos: null, archivos: [] }
    try {
      for (const p of paquetes) {
        if (p.manifest.tipo === 'datos') res.datos = await importarDatos({ api, zip: p.zip, manifest: p.manifest, destinoUrl: URL_ACTUAL, modo, incluirUsuarios: conUsuarios, onProgreso: setProgreso, cancelado })
        else res.archivos.push(await importarArchivos({ api, zip: p.zip, manifest: p.manifest, onProgreso: setProgreso, cancelado }))
      }
      setResultadoImp(res)
      toast('Importación terminada ✓ Revisa el resumen')
      verificar()
    } catch (e) { setErrorImp(e.message); setResultadoImp(res.datos || res.archivos.length ? res : null); toast(e.message, 'error') }
    finally { terminar(); setConfirmacion('') }
  }

  const puedeImportar = paquetes.length > 0 && confirmacion.trim().toUpperCase() === 'IMPORTAR' && !ocupado

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-title"><Ico as={Database} size={17} />Respaldo y migración de la base de datos</div>
      <p style={{ fontSize: '0.85rem', color: 'var(--texto-suave)', marginTop: 0 }}>
        Exporta TODA la base (datos + estructura + archivos) para moverla a otro proyecto de Supabase, y vuelve a importarla allí.
        Solo administradores. El ZIP contiene datos sensibles: guárdalo en un lugar privado.
      </p>

      {/* Requisito */}
      {estado.cargando && <p style={{ fontSize: '0.85rem' }}>Verificando…</p>}
      {estado.error === 'FALTA_MIGRACION' && (
        <div className="alert alert-warning" style={{ fontSize: '0.85rem' }}>
          <Ico as={AlertTriangle} />Falta instalar la migración <b>v184</b>. Ejecuta el archivo <code>supabase/migration_v184_respaldo_migracion.sql</code> en
          el SQL Editor de Supabase y pulsa <b>Verificar de nuevo</b>.
          <div style={{ marginTop: 8 }}><button className="btn btn-sm btn-secondary" onClick={verificar}><Ico as={RefreshCw} size={13} />Verificar de nuevo</button></div>
        </div>
      )}
      {estado.error && estado.error !== 'FALTA_MIGRACION' && <div className="alert alert-danger" style={{ fontSize: '0.85rem' }}><Ico as={AlertTriangle} />{estado.error}</div>}
      {cat && (
        <div className="alert alert-success" style={{ fontSize: '0.85rem' }}>
          <Ico as={CheckCircle2} />Listo: este proyecto tiene <b>{cat.tablas.length} tablas</b> y <b>{fmt(totalFilas)} filas</b> · {cat.funciones.length} funciones · {cat.politicas.length} políticas de seguridad · {cat.buckets.length} buckets de Storage.
          <div style={{ fontSize: '0.75rem', color: 'var(--texto-suave)' }}>Proyecto actual: {URL_ACTUAL || '(sin URL)'}</div>
        </div>
      )}

      {cat && (
        <>
          {/* Exportar */}
          <div style={{ marginTop: 14, fontWeight: 700, color: 'var(--selva)' }}><Ico as={Download} />1) Exportar</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
            <button className="btn btn-primary" disabled={!!ocupado} onClick={onExportar}><Ico as={FileArchive} size={15} />Exportar datos y estructura (ZIP)</button>
          </div>
          <small style={{ color: 'var(--texto-suave)' }}>
            Incluye todas las tablas, la estructura (SQL listo para el proyecto nuevo), permisos, políticas RLS, funciones y buckets. El token de Alegra se exporta vacío a propósito.
            Hazlo en un momento sin uso para que los números cuadren.
          </small>

          <div style={{ marginTop: 12, fontSize: '0.85rem', fontWeight: 600 }}>Archivos de Storage (imágenes, documentos) — por bucket</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '6px 0' }}>
            {cat.buckets.map(b => (
              <button key={b.id} className="btn btn-sm btn-secondary" disabled={!!ocupado} onClick={() => onExportarBucket(b.id)}>
                <Ico as={Download} size={13} />{b.id}{b.publico ? '' : ' 🔒'}
              </button>
            ))}
            {!cat.buckets.length && <small>No hay buckets de Storage.</small>}
          </div>

          {ocupado && ocupado !== 'importar' && <Barra progreso={progreso} onCancelar={() => { cancelar.current = true }} />}

          {resultadoExp?.ok && resultadoExp.manifest && (
            <div className="alert alert-success" style={{ fontSize: '0.83rem' }}>
              <Ico as={CheckCircle2} />Descargado <b>{resultadoExp.nombre}</b> ({(resultadoExp.bytes / 1048576).toFixed(1)} MB):
              {' '}{Object.keys(resultadoExp.manifest.tablas).length} tablas, {fmt(Object.values(resultadoExp.manifest.tablas).reduce((s, n) => s + n, 0))} filas.
              {resultadoExp.manifest.advertencias.map((a, i) => <div key={i} style={{ color: 'var(--naranja, #c47800)' }}>⚠ {a}</div>)}
            </div>
          )}
          {resultadoExp?.ok && resultadoExp.archivos && (
            <div className={`alert ${resultadoExp.archivos.fallidos.length ? 'alert-warning' : 'alert-success'}`} style={{ fontSize: '0.83rem' }}>
              <Ico as={CheckCircle2} />Bucket «{resultadoExp.bucket}»: {resultadoExp.archivos.exportados}/{resultadoExp.archivos.total} archivos en {resultadoExp.archivos.partes} ZIP.
              {resultadoExp.archivos.fallidos.slice(0, 5).map((f, i) => <div key={i}>⚠ {f}</div>)}
            </div>
          )}
          {resultadoExp && !resultadoExp.ok && <div className="alert alert-danger" style={{ fontSize: '0.83rem' }}><Ico as={AlertTriangle} />{resultadoExp.error}</div>}
        </>
      )}

      {/* Importar */}
      {cat && (
        <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--crema-oscuro)' }}>
          <div style={{ fontWeight: 700, color: 'var(--selva)' }}><Ico as={Upload} />2) Importar en ESTE proyecto</div>
          <small style={{ color: 'var(--texto-suave)', display: 'block', margin: '4px 0 8px' }}>
            Usa esto en el proyecto NUEVO, después de crear la estructura con los archivos de <code>esquema/</code> del ZIP y de crear tu usuario administrador (ver LEEME.md dentro del ZIP).
          </small>
          <button className="btn btn-secondary" disabled={!!ocupado} onClick={() => inputRef.current?.click()}><Ico as={FileArchive} size={15} />Elegir ZIP de respaldo…</button>
          <input ref={inputRef} type="file" accept=".zip" multiple style={{ display: 'none' }} onChange={onElegir} />

          {paquetes.map((p, i) => (
            <div key={p.nombre + i} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0', fontSize: '0.83rem' }}>
              <span className="badge badge-azul">{p.manifest.tipo === 'datos' ? 'Datos' : `Archivos · ${p.manifest.bucket}`}</span>
              <b>{p.nombre}</b>
              <span style={{ color: 'var(--texto-suave)' }}>
                {p.manifest.tipo === 'datos'
                  ? `${Object.keys(p.manifest.tablas).length} tablas · ${fmt(Object.values(p.manifest.tablas).reduce((s, n) => s + n, 0))} filas`
                  : `${(p.manifest.archivos || []).length} archivos`} · origen {p.manifest.origen || '?'} · {String(p.manifest.generado || '').slice(0, 10)}
              </span>
              <button type="button" className="btn btn-xs btn-secondary" onClick={() => quitar(i)} disabled={!!ocupado}><X size={12} /></button>
            </div>
          ))}

          {paquetes.length > 0 && (
            <>
              {mismoProyecto && <div className="alert alert-warning" style={{ fontSize: '0.83rem' }}><Ico as={AlertTriangle} />El respaldo viene de ESTE mismo proyecto. Importarlo aquí no duplica filas (omite las que ya existen), pero normalmente se usa en uno distinto.</div>}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '8px 0', fontSize: '0.85rem' }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  Si una fila ya existe:
                  <select className="form-control" style={{ width: 'auto' }} value={modo} onChange={e => setModo(e.target.value)} disabled={!!ocupado}>
                    <option value="omitir">Dejarla como está (recomendado)</option>
                    <option value="reemplazar">Reemplazarla con la del respaldo</option>
                  </select>
                </label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={!conUsuarios} onChange={e => setConUsuarios(!e.target.checked)} disabled={!!ocupado} />
                  No traer perfiles de usuario (recomendado: las cuentas de acceso no se copian)
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input className="form-control" style={{ width: 220 }} placeholder="Escribe IMPORTAR para confirmar" value={confirmacion} onChange={e => setConfirmacion(e.target.value)} disabled={!!ocupado} />
                <button className="btn btn-primary" disabled={!puedeImportar} onClick={onImportar}><Ico as={Upload} size={15} />Importar ahora</button>
              </div>
              <small style={{ color: 'var(--texto-suave)' }}>Se escribirá en {URL_ACTUAL}. Las URLs de archivos del proyecto de origen se reemplazan por las de este proyecto.</small>
            </>
          )}

          {ocupado === 'importar' && <Barra progreso={progreso} onCancelar={() => { cancelar.current = true }} />}
          {errorImp && <div className="alert alert-danger" style={{ fontSize: '0.83rem', marginTop: 8 }}><Ico as={AlertTriangle} />{errorImp}</div>}

          {resultadoImp?.datos && (() => {
            const filas = Object.entries(resultadoImp.datos.tablas)
            const tot = filas.reduce((a, [, x]) => ({ r: a.r + x.recibidas, i: a.i + x.insertadas, o: a.o + x.omitidas, e: a.e + x.errores }), { r: 0, i: 0, o: 0, e: 0 })
            return (
              <div style={{ marginTop: 10 }}>
                <div className={`alert ${tot.e ? 'alert-warning' : 'alert-success'}`} style={{ fontSize: '0.85rem' }}>
                  <Ico as={tot.e ? AlertTriangle : CheckCircle2} />Datos: <b>{fmt(tot.i)}</b> insertadas · {fmt(tot.o)} ya existían · <b>{fmt(tot.e)}</b> con error · {filas.length} tablas
                  {resultadoImp.datos.omitidasPorUsuario.length > 0 && <div>Perfiles de usuario no importados (por tu elección): {resultadoImp.datos.omitidasPorUsuario.join(', ')}.</div>}
                  {resultadoImp.datos.sinTabla.length > 0 && <div>⚠ Tablas del respaldo que no existen aquí (¿faltó crear la estructura?): {resultadoImp.datos.sinTabla.join(', ')}.</div>}
                  {resultadoImp.datos.erroresMensajes.map((m, i) => <div key={i} style={{ fontSize: '0.78rem' }}>· {m}</div>)}
                </div>
                <details style={{ fontSize: '0.8rem' }}>
                  <summary style={{ cursor: 'pointer' }}>Detalle por tabla</summary>
                  <div className="table-wrapper"><table>
                    <thead><tr><th>Tabla</th><th>Recibidas</th><th>Insertadas</th><th>Ya existían</th><th>Errores</th></tr></thead>
                    <tbody>{filas.map(([t, x]) => <tr key={t}><td>{t}</td><td>{fmt(x.recibidas)}</td><td>{fmt(x.insertadas)}</td><td>{fmt(x.omitidas)}</td><td style={x.errores ? { color: 'var(--rojo, #c0392b)', fontWeight: 700 } : undefined}>{fmt(x.errores)}</td></tr>)}</tbody>
                  </table></div>
                </details>
              </div>
            )
          })()}
          {resultadoImp?.archivos?.map((a, i) => (
            <div key={i} className={`alert ${a.fallidos.length ? 'alert-warning' : 'alert-success'}`} style={{ fontSize: '0.83rem', marginTop: 8 }}>
              <Ico as={a.fallidos.length ? AlertTriangle : CheckCircle2} />Archivos «{a.bucket}»: {a.subidos}/{a.total} subidos.
              {a.fallidos.slice(0, 5).map((f, k) => <div key={k}>⚠ {f}</div>)}
            </div>
          ))}
        </div>
      )}

      <details style={{ marginTop: 16, fontSize: '0.83rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--selva)' }}><Ico as={BookOpen} size={14} />Guía rápida: pasar la base a otro proyecto / otro usuario</summary>
        <ol style={{ lineHeight: 1.55, paddingLeft: 20 }}>
          <li>Aquí (proyecto actual): <b>Exportar datos y estructura</b> y, si quieres, los <b>archivos de Storage</b> de cada bucket.</li>
          <li>En supabase.com crea el proyecto NUEVO. En su <b>SQL Editor</b> ejecuta, en orden, los archivos de <code>esquema/</code> del ZIP (01 → 06).</li>
          <li>Publica la app apuntando al proyecto nuevo (<code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>).</li>
          <li>Crea tu usuario administrador (Authentication → Add user + una fila en <code>user_profiles</code>; el LEEME.md del ZIP trae el SQL exacto).</li>
          <li>Entra a la app nueva → Configuración → Respaldo y migración → <b>Importar</b> los ZIP (primero el de datos, luego los de archivos).</li>
          <li>Redespliega las Edge Functions y vuelve a configurar secretos y tareas programadas (están listados en el LEEME.md).</li>
        </ol>
      </details>
    </div>
  )
}
