import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Lock, Package } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { liberarReservaLotes, consumirReservaLotes, sincronizarPEPSAlStock } from '../lib/lotes'
import { cantidadSinLotes, esCategoriaEmpaque, stockSeMovioAlReservar } from '../lib/reservasMp'
import { useToast } from '../hooks/useToast'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import { useNavTrail } from '../hooks/useNavTrail'
import Modal from './ui/Modal'
import { AccordionItem, Fila } from './ui/Acordeon'

const Ico = ({ as: C, size = 15 }) => <C size={size} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} aria-hidden="true" />

const ESTADOS_ABIERTOS = new Set(['pendiente', 'en_proceso', 'rechazada'])
const EPS = 0.0001

const fmtCant = (n) => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 3 })

async function guardarSnapshot(ordenId, items) {
  const next = items?.length ? items : null
  let { error } = await supabase.from('production_orders').update({
    lotes_reservados: next,
    ...(next ? {} : { saldos_reservados: null }),
  }).eq('id', ordenId)
  if (error && /saldos_reservados/i.test(error.message || '')) {
    ({ error } = await supabase.from('production_orders').update({ lotes_reservados: next }).eq('id', ordenId))
  }
  if (error) throw error
}

async function alinearMp(mpId, creadoPor) {
  if (!mpId) return
  const { data: mp } = await supabase.from('raw_materials').select('stock, precio').eq('id', mpId).maybeSingle()
  if (!mp) return
  await sincronizarPEPSAlStock({
    mp_id: mpId,
    stock: Number(mp.stock) || 0,
    costo_unitario: Number(mp.precio) || 0,
    creado_por: creadoPor || 'sistema',
  })
}

async function aplicarDestinoAItem(item, destino) {
  const lotes = item?.lotes || []
  const consumo = Number(item?.consumo) || 0
  if (destino === 'devolver') {
    await liberarReservaLotes(lotes)
    if (consumo > 0 && item.mp_id && stockSeMovioAlReservar(item)) {
      const { error } = await supabase.rpc('ajustar_stock_mp', { p_mp_id: item.mp_id, p_delta: consumo })
      if (error) throw error
    }
  } else if (destino === 'consumir') {
    await consumirReservaLotes(lotes)
  }
  // desamarrar: no toca lotes ni stock
}

function buildFilas(ordenes, lotesReservados, mps) {
  const mpById = new Map((mps || []).map(m => [String(m.id), m]))
  const claimed = new Map()
  const filas = []

  for (const o of ordenes || []) {
    const items = Array.isArray(o.lotes_reservados) ? o.lotes_reservados : []
    if (!items.length) continue
    const cerrada = !ESTADOS_ABIERTOS.has(o.estado)
    for (const it of items) {
      const lotes = Array.isArray(it.lotes) ? it.lotes : []
      for (const l of lotes) {
        const qty = Number(l.cantidad) || 0
        if (l.id) claimed.set(String(l.id), (claimed.get(String(l.id)) || 0) + qty)
      }
      const mpRow = mpById.get(String(it.mp_id))
      const esEmpaque = !!(it.es_empaque || esCategoriaEmpaque(mpRow?.categoria))
      const sinLoteQty = cantidadSinLotes(it)
      filas.push({
        key: `op-${o.id}-mp-${it.mp_id}`,
        tipo: 'amarrada',
        orden: o,
        item: it,
        mp_id: it.mp_id,
        nombre: it.nombre || mpRow?.nombre || `MP #${it.mp_id}`,
        unidad: it.unidad || mpRow?.unidad || '',
        cantidad: Number(it.consumo) || lotes.reduce((s, l) => s + (Number(l.cantidad) || 0), 0) + sinLoteQty,
        lotes,
        sinLoteQty,
        esEmpaque,
        alerta: cerrada ? 'orden_cerrada' : null,
      })
    }
  }

  for (const l of lotesReservados || []) {
    const reserved = Number(l.cantidad_reservada) || 0
    if (reserved <= EPS) continue
    const tomado = claimed.get(String(l.id)) || 0
    const extra = reserved - tomado
    if (extra <= EPS) continue
    const mp = mpById.get(String(l.mp_id))
    filas.push({
      key: `huerfana-${l.id}`,
      tipo: 'huerfana',
      orden: null,
      item: null,
      mp_id: l.mp_id,
      nombre: mp?.nombre || `MP #${l.mp_id}`,
      unidad: mp?.unidad || '',
      cantidad: extra,
      lote: l,
      alerta: 'huerfana',
      loteReservado: reserved,
      loteClaimed: tomado,
    })
  }

  for (const f of filas) {
    if (f.tipo !== 'amarrada') continue
    const descuadre = (f.lotes || []).some(l => {
      const lote = (lotesReservados || []).find(x => String(x.id) === String(l.id))
      const enLote = Number(lote?.cantidad_reservada) || 0
      return (Number(l.cantidad) || 0) - enLote > EPS
    })
    if (descuadre) f.alerta = f.alerta || 'descuadre'
  }

  return filas
}

const DESTINOS = [
  {
    id: 'devolver',
    titulo: 'No se usó — devolver al inventario',
    detalle: 'Quita la reserva del lote, suma otra vez a disponible y sube el stock general. Úsalo si la orden se devolvió/canceló y la MP sigue en bodega.',
  },
  {
    id: 'consumir',
    titulo: 'Sí se usó — confirmar consumo',
    detalle: 'Quita la reserva del lote y NO la devuelve. El stock ya había bajado al reservar. Úsalo si la MP se gastó pero el sistema quedó con la reserva colgada.',
  },
  {
    id: 'desamarrar',
    titulo: 'El lote ya está bien — solo quitar el amarre',
    detalle: 'No mueve inventario. Solo borra el vínculo en la orden (JSON). Úsalo si ya corregiste el lote a mano y la orden sigue mostrando la reserva.',
  },
]

async function aplicarHuerfana(fila, dest) {
  if (dest === 'desamarrar') throw new Error('Una reserva huérfana no tiene orden que desamarrar. Elige devolver o consumir.')
  const lote = fila.lote
  const qty = Number(fila.cantidad) || 0
  if (dest === 'devolver') {
    await liberarReservaLotes([{ id: lote.id, cantidad: qty }])
    const { error } = await supabase.rpc('ajustar_stock_mp', { p_mp_id: lote.mp_id, p_delta: qty })
    if (error) throw error
  } else {
    await consumirReservaLotes([{ id: lote.id, cantidad: qty }])
  }
}

export default function ReservasMPPanel({ esAdmin, mps = [], open = false, onClose, historicos = [], onIgualar, igualarPending = false }) {
  const toast = useToast()
  const confirmar = useConfirm()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const { pushTo } = useNavTrail()
  const [gestionar, setGestionar] = useState(null)
  const [destino, setDestino] = useState('')
  const [selHuerfanas, setSelHuerfanas] = useState(() => new Set())

  const { data: ordenes = [] } = useQuery({
    queryKey: ['production_orders', 'reservas'],
    queryFn: async () => {
      const { data } = await supabase.from('production_orders')
        .select('id, producto, estado, lotes_reservados, created_at, origen, origen_id, cantidad_plan, cant_subporciones')
        .order('created_at', { ascending: false })
      return data || []
    },
  })
  const idsFicha = useMemo(
    () => [...new Set((ordenes || []).filter(o => ESTADOS_ABIERTOS.has(o.estado) && o.origen === 'producto' && o.origen_id).map(o => o.origen_id))],
    [ordenes],
  )
  const { data: fichasEmpaque = [] } = useQuery({
    queryKey: ['products_costing', 'empaque-reservas', idsFicha],
    enabled: idsFicha.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from('products_costing').select('id, empaque, bache, merma').in('id', idsFicha)
      return data || []
    },
  })
  const { data: lotesReservados = [] } = useQuery({
    queryKey: ['raw_material_lots', 'reservados'],
    queryFn: async () => {
      const { data, error } = await supabase.from('raw_material_lots')
        .select('id, mp_id, lote, cantidad_actual, cantidad_reservada, vencimiento')
        .gt('cantidad_reservada', 0)
      if (error) throw error
      return data || []
    },
  })
  const ordenStartNum = parseInt(localStorage.getItem('mumi_orden_start')) || 1
  const opNum = (id) => {
    const ids = [...ordenes].map(o => o.id).sort((a, b) => a - b)
    const idx = ids.indexOf(parseInt(id))
    return (idx >= 0 ? idx : 0) + ordenStartNum
  }

  const filas = useMemo(
    () => {
      const base = buildFilas(ordenes, lotesReservados, mps)
      const fichaById = new Map((fichasEmpaque || []).map(f => [String(f.id), f]))
      const mpById = new Map((mps || []).map(m => [String(m.id), m]))
      const extra = []
      for (const o of ordenes || []) {
        if (!ESTADOS_ABIERTOS.has(o.estado) || o.origen !== 'producto' || !o.origen_id) continue
        const ficha = fichaById.get(String(o.origen_id))
        if (!ficha) continue
        let emps = []
        try { emps = Array.isArray(ficha.empaque) ? ficha.empaque : JSON.parse(ficha.empaque || '[]') } catch { emps = [] }
        const ya = new Set((Array.isArray(o.lotes_reservados) ? o.lotes_reservados : []).map(it => String(it.mp_id)))
        for (const e of emps) {
          if (!e.mpId || ya.has(String(e.mpId))) continue
          const mp = mpById.get(String(e.mpId))
          const unidsBache = (parseFloat(ficha.bache) || 0) * (1 - (parseFloat(ficha.merma) || 0) / 100)
          const ratio = unidsBache > 0 ? (parseFloat(e.cantidad) || 0) / unidsBache : 1
          const uni = parseFloat(o.cantidad_plan) || 0
          const qty = Math.round(uni * ratio) || Number(e.cantidad) || 0
          extra.push({
            key: `op-${o.id}-emp-${e.mpId}`,
            tipo: 'amarrada',
            orden: o,
            item: { mp_id: e.mpId, es_empaque: true, consumo: qty, lotes: [], stock_movido: false },
            mp_id: e.mpId,
            nombre: mp?.nombre || `MP #${e.mpId}`,
            unidad: mp?.unidad || '',
            cantidad: qty,
            lotes: [],
            sinLoteQty: qty,
            esEmpaque: true,
            soloFicha: true,
            alerta: null,
          })
        }
      }
      return [...base, ...extra]
    },
    [ordenes, lotesReservados, mps, fichasEmpaque],
  )
  const huerfanas = filas.filter(f => f.tipo === 'huerfana')
  const alertas = filas.filter(f => f.alerta).length
  const filasEmpaque = useMemo(
    () => filas.filter(f => f.esEmpaque).toSorted((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [filas],
  )
  const resumenEmpaque = useMemo(() => {
    const map = new Map()
    for (const f of filasEmpaque) {
      const k = String(f.mp_id)
      const g = map.get(k) || { nombre: f.nombre, unidad: f.unidad, total: 0 }
      g.total += Number(f.cantidad) || 0
      map.set(k, g)
    }
    return [...map.values()]
  }, [filasEmpaque])
  const filasOtras = filas.filter(f => !f.esEmpaque)

  const mutar = useMutation({
    mutationFn: async ({ destino: dest, fila, filas, alcance }) => {
      if (!dest) throw new Error('Elige qué pasó con la reserva')
      if (alcance === 'huerfanas' || fila?.tipo === 'huerfana') {
        const lista = alcance === 'huerfanas' ? (filas || []) : [fila]
        if (!lista.length) throw new Error('Selecciona al menos una reserva huérfana')
        const errores = []
        const mpsHechas = new Set()
        for (const f of lista) {
          try {
            await aplicarHuerfana(f, dest)
            mpsHechas.add(f.mp_id)
          } catch (e) {
            errores.push(`${f.nombre || f.mp_id}: ${e?.message || e}`)
          }
        }
        for (const mpId of mpsHechas) {
          try { await alinearMp(mpId, profile?.nombre) } catch { /* best-effort */ }
        }
        if (errores.length) throw new Error(errores.join('\n'))
        return
      }

      const ordenId = fila.orden.id
      const { data: live, error: liveErr } = await supabase.from('production_orders')
        .select('id, lotes_reservados, lotes_mp')
        .eq('id', ordenId).single()
      if (liveErr || !live) throw new Error('No se pudo leer la orden')
      const actuales = Array.isArray(live.lotes_reservados) ? live.lotes_reservados : []
      const items = alcance === 'orden'
        ? actuales
        : actuales.filter(it => String(it.mp_id) === String(fila.mp_id))
      if (!items.length) throw new Error('Esa reserva ya no está en la orden (otro usuario la movió). Recarga e intenta de nuevo.')

      const errores = []
      for (const it of items) {
        try {
          await aplicarDestinoAItem(it, dest)
          try { await alinearMp(it.mp_id, profile?.nombre) } catch { /* best-effort */ }
        } catch (e) {
          errores.push(`${it.nombre || it.mp_id}: ${e?.message || e}`)
        }
      }
      if (errores.length) throw new Error(errores.join('\n'))

      const idsHechos = new Set(items.map(it => String(it.mp_id)))
      const restantes = actuales.filter(it => !idsHechos.has(String(it.mp_id)))
      if (dest === 'consumir') {
        const prevMp = Array.isArray(live.lotes_mp) ? live.lotes_mp : []
        const idsPrev = new Set(prevMp.map(it => String(it.mp_id)))
        const nuevos = items.filter(it => !idsPrev.has(String(it.mp_id)))
        if (nuevos.length) {
          const { error: mpErr } = await supabase.from('production_orders')
            .update({ lotes_mp: [...prevMp, ...nuevos] }).eq('id', ordenId)
          if (mpErr) throw mpErr
        }
      }
      await guardarSnapshot(ordenId, restantes)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production_orders'] })
      qc.invalidateQueries({ queryKey: ['raw_materials'] })
      qc.invalidateQueries({ queryKey: ['raw_material_lots'] })
      toast('Reserva actualizada ✓')
      setGestionar(null)
      setDestino('')
      setSelHuerfanas(new Set())
    },
    onError: (e) => toast(e.message || 'No se pudo gestionar la reserva', 'error'),
  })

  const amarrarEmpaque = useMutation({
    mutationFn: async (fila) => {
      const qty = Number(fila.cantidad) || 0
      if (!(qty > 0)) throw new Error('No hay cantidad de empaque para reservar')
      const { data: live, error: liveErr } = await supabase.from('production_orders')
        .select('id, lotes_reservados').eq('id', fila.orden.id).single()
      if (liveErr || !live) throw new Error('No se pudo leer la orden')
      const actuales = Array.isArray(live.lotes_reservados) ? live.lotes_reservados : []
      if (actuales.some(it => String(it.mp_id) === String(fila.mp_id))) {
        throw new Error('Ese empaque ya está en la reserva de la orden')
      }
      const { error } = await supabase.rpc('ajustar_stock_mp', { p_mp_id: fila.mp_id, p_delta: -qty })
      if (error) throw error
      await guardarSnapshot(fila.orden.id, [...actuales, {
        mp_id: fila.mp_id, nombre: fila.nombre, unidad: fila.unidad, consumo: qty,
        lotes: [], sin_lote: true, es_empaque: true, sin_lote_cantidad: qty, stock_movido: true,
      }])
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production_orders'] })
      qc.invalidateQueries({ queryKey: ['raw_materials'] })
      toast('Empaque reservado ✓')
    },
    onError: (e) => toast(e.message || 'No se pudo reservar el empaque', 'error'),
  })

  const abrir = (fila, alcance = 'mp', filasExtra = null) => {
    setDestino('')
    setGestionar({ fila, alcance, filas: filasExtra })
  }

  const aplicar = async () => {
    if (!gestionar || !destino) return
    const { fila, alcance, filas: filasSel } = gestionar
    const destMeta = DESTINOS.find(d => d.id === destino)
    const quien = alcance === 'huerfanas'
      ? `${filasSel.length} reservas huérfanas`
      : fila.tipo === 'huerfana'
        ? `lote ${fila.lote?.lote || fila.lote?.id} (${fmtCant(fila.cantidad)} ${fila.unidad})`
        : alcance === 'orden'
          ? `toda la reserva de OP-${opNum(fila.orden.id)}`
          : `${fila.nombre} en OP-${opNum(fila.orden.id)} (${fmtCant(fila.cantidad)} ${fila.unidad})`
    const ok = await confirmar(`¿Confirmar?\n\n${destMeta.titulo}\n\nSobre: ${quien}\n\n${destMeta.detalle}`)
    if (!ok) return
    mutar.mutate({ destino, fila, filas: filasSel, alcance })
  }

  const ESTADO_TXT = {
    pendiente: 'Pendiente', en_proceso: 'En proceso', ejecutada: 'Enviada',
    aprobada: 'Aprobada', rechazada: 'Rechazada', cancelada: 'Cerrada sin ejecutar',
  }

  const txtLotes = (f) => {
    if (f.tipo === 'huerfana') return f.lote?.lote || `lote #${f.lote?.id}`
    if ((f.lotes || []).length) {
      const extra = f.sinLoteQty > 0 ? ` · ${fmtCant(f.sinLoteQty)} sin lote` : ''
      return f.lotes.map((l, i) => `${i ? ' · ' : ''}${l.lote || 's/lote'}: ${fmtCant(l.cantidad)}`).join('') + extra
    }
    if (f.esEmpaque) return 'reserva sin lote PEPS'
    if (f.sinLoteQty > 0) return 'sin lote (stock general)'
    return '—'
  }

  const badgeDiag = (f) => {
    if (f.soloFicha) return <span className="badge badge-dorado">Sin amarrar</span>
    if (f.alerta === 'huerfana') return <span className="badge badge-rojo"><AlertTriangle size={11} aria-hidden="true" /> Huérfana</span>
    if (f.alerta === 'orden_cerrada') return <span className="badge badge-dorado">Orden cerrada</span>
    if (f.alerta === 'descuadre') return <span className="badge badge-rojo">Descuadre lote</span>
    return <span className="badge badge-verde">Activa</span>
  }

  const accionesFila = (f, lista) => {
    const primeraDeOrden = f.orden && lista.findIndex(x => x.orden && x.orden.id === f.orden.id) === lista.indexOf(f)
    if (f.soloFicha) {
      return (
        <button type="button" className="btn btn-xs btn-primary" disabled={amarrarEmpaque.isPending}
          onClick={() => confirmar(`¿Reservar ${fmtCant(f.cantidad)} ${f.unidad} de ${f.nombre} para OP-${opNum(f.orden.id)}?\nBaja del stock ahora. Si cancelas la orden, se devuelve.`).then(ok => ok && amarrarEmpaque.mutate(f))}>
          Reservar
        </button>
      )
    }
    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-xs btn-secondary" onClick={() => abrir(f, f.tipo === 'huerfana' ? 'huerfana' : 'mp')}>
          <Ico as={Package} size={13} />{f.tipo === 'huerfana' ? 'Esta reserva' : 'Esta MP'}
        </button>
        {primeraDeOrden ? (
          <button type="button" className="btn btn-xs btn-secondary" onClick={() => abrir(f, 'orden')}>Toda la OP</button>
        ) : null}
      </div>
    )
  }

  const renderFilas = (lista) => lista.map((f) => {
    const est = f.orden?.estado
    return (
      <tr key={f.key} style={f.alerta ? { background: 'rgba(200,169,74,0.08)' } : undefined}>
        {esAdmin && (
          <td>
            {f.tipo === 'huerfana' ? (
              <input type="checkbox" checked={selHuerfanas.has(f.key)} aria-label={`Seleccionar ${f.nombre}`}
                onChange={() => setSelHuerfanas(prev => {
                  const next = new Set(prev)
                  if (next.has(f.key)) next.delete(f.key)
                  else next.add(f.key)
                  return next
                })} />
            ) : null}
          </td>
        )}
        <td>
          {f.orden
            ? <button type="button" className="btn-link-emp" onClick={() => { onClose?.(); pushTo('/ordenes', { verOrden: f.orden.id }) }}>OP-{opNum(f.orden.id)}</button>
            : <span style={{ color: 'var(--texto-suave)' }}>—</span>}
        </td>
        <td className="col-opcional">{f.orden ? (ESTADO_TXT[est] || est || '—') : 'sin orden'}</td>
        <td className="col-opcional-2">{f.orden?.producto || '—'}</td>
        <td>
          <strong>{f.nombre}</strong>
          {f.esEmpaque ? <span className="badge badge-dorado" style={{ marginLeft: 6, fontSize: '0.62rem' }}>Empaque</span> : null}
        </td>
        <td className="col-opcional" style={{ fontSize: '0.78rem' }}>{txtLotes(f)}</td>
        <td className="td-number"><strong>{fmtCant(f.cantidad)}</strong> {f.unidad}</td>
        <td>{badgeDiag(f)}</td>
        {esAdmin && <td className="celda-acciones">{accionesFila(f, lista)}</td>}
      </tr>
    )
  })

  const renderMovil = (lista) => lista.map((f) => {
    const est = f.orden?.estado
    return (
      <AccordionItem
        key={f.key}
        titulo={<>
          {f.alerta ? <AlertTriangle size={13} aria-hidden="true" style={{ color: 'var(--tierra)', marginRight: 4, verticalAlign: '-2px' }} /> : null}
          {f.nombre}
          {f.esEmpaque ? <span className="badge badge-dorado" style={{ marginLeft: 6, fontSize: '0.58rem' }}>Empaque</span> : null}
        </>}
        sub={<>{f.orden ? `OP-${opNum(f.orden.id)}` : 'sin orden'} · {fmtCant(f.cantidad)} {f.unidad} · {badgeDiag(f)}</>}
      >
        <Fila et="Orden">{f.orden
          ? <button type="button" className="btn-link-emp" onClick={() => { onClose?.(); pushTo('/ordenes', { verOrden: f.orden.id }) }}>OP-{opNum(f.orden.id)}</button>
          : '—'}</Fila>
        <Fila et="Estado">{f.orden ? (ESTADO_TXT[est] || est || '—') : 'sin orden'}</Fila>
        <Fila et="Producto">{f.orden?.producto || '—'}</Fila>
        <Fila et="Lotes">{txtLotes(f)}</Fila>
        <Fila et="Cantidad"><strong>{fmtCant(f.cantidad)}</strong> {f.unidad}</Fila>
        {esAdmin && f.tipo === 'huerfana' && (
          <Fila et="Elegir">
            <input type="checkbox" checked={selHuerfanas.has(f.key)} aria-label={`Seleccionar ${f.nombre}`}
              onChange={() => setSelHuerfanas(prev => {
                const next = new Set(prev)
                if (next.has(f.key)) next.delete(f.key)
                else next.add(f.key)
                return next
              })} />
          </Fila>
        )}
        {esAdmin && <div className="acordeon-acciones">{accionesFila(f, lista)}</div>}
      </AccordionItem>
    )
  })

  const thead = (
    <thead>
      <tr>
        {esAdmin && <th style={{ width: 36 }}></th>}
        <th>Orden</th>
        <th className="col-opcional">Estado</th>
        <th className="col-opcional-2">Producto</th>
        <th>Materia prima</th>
        <th className="col-opcional">Lotes</th>
        <th className="td-number">Cantidad</th>
        <th>Diagnóstico</th>
        {esAdmin && <th>Gestionar</th>}
      </tr>
    </thead>
  )

  return (
    <>
      <Modal
        open={open}
        onClose={() => { if (!mutar.isPending && !gestionar) onClose?.() }}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Lock size={18} aria-hidden="true" /> Materias primas reservadas
          {filas.length > 0 && <span className="badge badge-dorado">{filas.length}</span>}
          {alertas > 0 && <span className="badge badge-rojo">{alertas} por revisar</span>}
        </span>}
        size="modal-lg"
        footer={<button className="btn btn-secondary" onClick={() => onClose?.()}>Cerrar</button>}
      >
          <p style={{ fontSize: '0.78rem', color: 'var(--texto-suave)', margin: '0 0 10px' }}>
            Lo amarrado a una orden en proceso. El empaque se reserva igual que el resto (baja el stock, sin lote PEPS).
            Si cierras la orden, se consume. Si la cancelas o borras, vuelve al stock.
          </p>
          {esAdmin && huerfanas.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
              <button type="button" className="btn btn-xs btn-secondary" onClick={() => {
                setSelHuerfanas(selHuerfanas.size === huerfanas.length ? new Set() : new Set(huerfanas.map(f => f.key)))
              }}>
                {selHuerfanas.size === huerfanas.length ? 'Quitar selección' : `Seleccionar ${huerfanas.length} huérfanas`}
              </button>
              {selHuerfanas.size > 0 && (
                <button type="button" className="btn btn-xs btn-primary" onClick={() => {
                  const elegidas = huerfanas.filter(f => selHuerfanas.has(f.key))
                  abrir(elegidas[0], 'huerfanas', elegidas)
                }}>
                  Gestionar {selHuerfanas.size} seleccionada{selHuerfanas.size === 1 ? '' : 's'}
                </button>
              )}
            </div>
          )}
          {filasEmpaque.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <h4 style={{ margin: '0 0 6px', fontSize: '0.9rem' }}>Empaques</h4>
              {resumenEmpaque.length > 0 && (
                <p style={{ fontSize: '0.75rem', color: 'var(--texto-suave)', margin: '0 0 8px' }}>
                  {resumenEmpaque.map((g, i) => `${i ? ' · ' : ''}${g.nombre}: ${fmtCant(g.total)} ${g.unidad}`).join('')}
                </p>
              )}
              <div className="solo-movil">{renderMovil(filasEmpaque)}</div>
              <div className="table-wrap solo-desktop">
                <table>
                  {thead}
                  <tbody>{renderFilas(filasEmpaque)}</tbody>
                </table>
              </div>
            </div>
          )}

          <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem' }}>Materias primas</h4>
          <div className="solo-movil">
            {filasOtras.length === 0
              ? <p className="empty-table">No hay otras MP reservadas</p>
              : renderMovil(filasOtras)}
          </div>
          <div className="table-wrap solo-desktop">
            <table>
              {thead}
              <tbody>
                {filasOtras.length === 0 && (
                  <tr><td colSpan={esAdmin ? 9 : 7} className="empty-table">No hay otras MP reservadas</td></tr>
                )}
                {renderFilas(filasOtras)}
              </tbody>
            </table>
          </div>

          {historicos.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <h4 style={{ margin: '0 0 6px', fontSize: '0.9rem' }}>
                <AlertTriangle size={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />
                Descuadre histórico (sin orden abierta)
              </h4>
              <p style={{ fontSize: '0.75rem', color: 'var(--texto-suave)', margin: '0 0 8px' }}>
                El stock general no coincide con la suma de lotes y ninguna orden en proceso lo explica.
                Igualar alinea los lotes al stock (no cambia el stock).
              </p>
              <div className="solo-movil">
                {historicos.map(h => (
                  <AccordionItem
                    key={h.mp.id}
                    titulo={h.mp.nombre}
                    sub={`diff ${fmtCant(h.descuadre.diff)} ${h.mp.unidad}`}
                  >
                    <Fila et="Stock">{fmtCant(h.descuadre.stock)} {h.mp.unidad}</Fila>
                    <Fila et="Lotes PEPS">{fmtCant(h.descuadre.porLotes)} {h.mp.unidad}</Fila>
                    <Fila et="Diferencia">{fmtCant(h.descuadre.diff)} {h.mp.unidad}</Fila>
                    {esAdmin && (
                      <div className="acordeon-acciones">
                        <button type="button" className="btn btn-xs btn-dorado" disabled={igualarPending}
                          onClick={() => onIgualar?.(h.mp)}>
                          {h.descuadre.diff > 0 ? 'Crear PEPS' : 'Igualar'}
                        </button>
                      </div>
                    )}
                  </AccordionItem>
                ))}
              </div>
              <div className="table-wrap solo-desktop">
                <table>
                  <thead>
                    <tr>
                      <th>Materia prima</th>
                      <th className="td-number">Stock</th>
                      <th className="td-number col-opcional">Lotes PEPS</th>
                      <th className="td-number">Diferencia</th>
                      {esAdmin && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {historicos.map(h => (
                      <tr key={h.mp.id}>
                        <td><strong>{h.mp.nombre}</strong></td>
                        <td className="td-number">{fmtCant(h.descuadre.stock)} {h.mp.unidad}</td>
                        <td className="td-number col-opcional">{fmtCant(h.descuadre.porLotes)} {h.mp.unidad}</td>
                        <td className="td-number">{fmtCant(h.descuadre.diff)} {h.mp.unidad}</td>
                        {esAdmin && (
                          <td>
                            <button type="button" className="btn btn-xs btn-dorado" disabled={igualarPending}
                              onClick={() => onIgualar?.(h.mp)}>
                              {h.descuadre.diff > 0 ? 'Crear PEPS' : 'Igualar'}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
      </Modal>

      <Modal
        open={!!gestionar}
        onClose={() => { if (!mutar.isPending) { setGestionar(null); setDestino('') } }}
        title="Indicar qué pasó con la reserva"
        size="modal-md"
        footer={<>
          <button className="btn btn-secondary" disabled={mutar.isPending} onClick={() => { setGestionar(null); setDestino('') }}>Cancelar</button>
          <button className="btn btn-primary" disabled={!destino || mutar.isPending} onClick={aplicar}>
            {mutar.isPending ? 'Aplicando…' : 'Aplicar'}
          </button>
        </>}
      >
        {gestionar && (
          <div>
            <p style={{ margin: '0 0 12px', fontSize: '0.9rem' }}>
              {gestionar.alcance === 'huerfanas'
                ? <>{gestionar.filas.length} reservas <strong>huérfanas</strong> (sin orden): {gestionar.filas.map(f => `${f.nombre} ${fmtCant(f.cantidad)} ${f.unidad}`).join(' · ')}</>
                : gestionar.fila.tipo === 'huerfana'
                  ? <>Reserva <strong>sin orden</strong> en {gestionar.fila.nombre} · lote {gestionar.fila.lote?.lote || gestionar.fila.lote?.id} · {fmtCant(gestionar.fila.cantidad)} {gestionar.fila.unidad}</>
                  : gestionar.alcance === 'orden'
                    ? <>Toda la MP reservada de <strong>OP-{opNum(gestionar.fila.orden.id)}</strong> ({gestionar.fila.orden.producto})</>
                    : <><strong>{gestionar.fila.nombre}</strong> amarrada a <strong>OP-{opNum(gestionar.fila.orden.id)}</strong> · {fmtCant(gestionar.fila.cantidad)} {gestionar.fila.unidad}</>}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {DESTINOS.filter(d => (gestionar.fila?.tipo !== 'huerfana' && gestionar.alcance !== 'huerfanas') || d.id !== 'desamarrar').map(d => (
                <label key={d.id} style={{
                  display: 'block', border: `1px solid ${destino === d.id ? 'var(--selva)' : 'var(--crema-oscuro)'}`,
                  borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
                  background: destino === d.id ? 'rgba(124,179,66,0.08)' : 'transparent',
                }}>
                  <input type="radio" name="destino-reserva" value={d.id} checked={destino === d.id} onChange={() => setDestino(d.id)} style={{ marginRight: 8 }} />
                  <strong>{d.titulo}</strong>
                  <div style={{ fontSize: '0.78rem', color: 'var(--texto-suave)', marginTop: 4, marginLeft: 22 }}>{d.detalle}</div>
                </label>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
