import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, uploadFile } from '../lib/supabase'
import { fCOP, fNum, fFecha, calcularReceta } from '../lib/businessLogic'
import MoneyInput from '../components/ui/MoneyInput'
import { CATALOGO_PARAMS, PARAM_UNIDAD } from '../lib/calidad'
import { useToast } from '../hooks/useToast'
import { useConfirm } from '../context/ConfirmContext'
import { useReorder } from '../hooks/useReorder'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/ui/Modal'
import ImageCropper from '../components/ui/ImageCropper'
import BuscadorSelect from '../components/ui/BuscadorSelect'

export default function Receta({ embedded = false, productos = [], onConvertir }) {
  const toast = useToast()
  const confirmar = useConfirm()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const imgInputRef  = useRef()
  const { profile } = useAuth()
  const rol = profile?.rol || 'admin'
  const esAdmin    = rol === 'admin'
  const esOperario = rol === 'operario'
  const esAuxiliar = rol === 'auxiliar'
  const soloLectura = esAuxiliar   // el auxiliar no edita nada (solo carga base y usa el ancla)


  // ---- Estado de la calculadora ----
  const [selValue, setSelValue]       = useState('')   // valor del selector: '' | prod-{id} | recipe-{id}
  const [recetaSelId, setRecetaSelId] = useState('')   // id de receta rápida en edición (null si viene de producto)
  const [nombre, setNombre]           = useState('')
  const [ingredientes, setIngredientes] = useState([])
  const [ancla, setAncla]             = useState('')
  const [cantidadAncla, setCantAncla] = useState('')
  const [pesoTotalMezcla, setPesoTotalMezcla] = useState('')   // referencia para sincronizar % ↔ gramos
  const [modoCalc, setModoCalc]       = useState('ancla')   // 'ancla' | 'unidades'
  const [unidadesObj, setUnidadesObj] = useState('')        // unidades de producto a fabricar
  const [rendimiento, setRendimiento] = useState(62)
  const [desperdicio, setDesperdicio] = useState(2)
  const [pesoUnidad, setPesoUnidad]   = useState(1000)
  const [porciona, setPorciona]           = useState(false)
  const [pesoSubporcion, setPesoSubporcion] = useState('')
  const [brixAplica, setBrixAplica]   = useState(false)
  const [brix, setBrix]               = useState(75)
  const [paramsCalidad, setParamsCalidad] = useState([])   // [{ nombre, valor, unidad }]
  const addParamCalidad = () => setParamsCalidad(p => [...p, { nombre: '', valor: '', unidad: '' }])
  const updParamCalidad = (i, campo, val) => setParamsCalidad(p => p.map((x, idx) => {
    if (idx !== i) return x
    const next = { ...x, [campo]: val }
    if (campo === 'nombre' && PARAM_UNIDAD[val] !== undefined) next.unidad = PARAM_UNIDAD[val]
    return next
  }))
  const delParamCalidad = (i) => setParamsCalidad(p => p.filter((_, idx) => idx !== i))
  const [imgData, setImgData]         = useState('')
  const [cropRec, setCropRec]         = useState(null)   // archivo pendiente de recortar
  const [fichaFile, setFichaFile]         = useState(null)
  const [fichaNombre, setFichaNombre]     = useState('')
  const [fichaStoragePath, setFichaStoragePath] = useState('')
  const [resultado, setResultado]     = useState(null)
  const [saving, setSaving]           = useState(false)

  // ---- Queries ----
  const { data: recetas = [], refetch: refetchRecetas } = useQuery({
    queryKey: ['recipes'],
    queryFn: async () => {
      const { data } = await supabase.from('recipes').select('*').order('tipo').order('nombre')
      return data || []
    },
  })

  const { data: mps = [] } = useQuery({
    queryKey: ['raw_materials'],
    queryFn: async () => {
      const { data } = await supabase.from('raw_materials').select('id, nombre, precio, unidad').order('nombre')
      return data || []
    },
  })

  // ---- Calcular resultado cada vez que cambian inputs ----
  const calcular = useCallback(() => {
    const rend = parseFloat(rendimiento) || 62
    const desp = parseFloat(desperdicio) || 2
    const pu   = parseFloat(pesoUnidad)  || 1000
    let anclaEf = ancla
    let cantAnclaEf = parseFloat(cantidadAncla) || 0

    // Modo "por unidades": calcula la mezcla total necesaria para fabricar N unidades
    // totalMezcla = (unidades × peso_unidad) / (rendimiento% × (1 − desperdicio%))
    if (modoCalc === 'unidades') {
      const U = parseFloat(unidadesObj) || 0
      const denom = (rend / 100) * (1 - desp / 100)
      const totalMezcla = denom > 0 ? (U * pu) / denom : 0
      // ancla efectiva: la elegida (si tiene %) o el primer ingrediente normal con %
      const anclaRow = ingredientes.find(i => i.nombre === ancla && (parseFloat(i.pct) || 0) > 0)
        || ingredientes.find(i => i.tipo !== 'relativo' && (parseFloat(i.pct) || 0) > 0 && (i.nombre || '').trim())
      anclaEf = anclaRow?.nombre || ''
      cantAnclaEf = anclaRow ? totalMezcla * ((parseFloat(anclaRow.pct) || 0) / 100) : 0
    }

    const res = calcularReceta({
      ingredientes, ancla: anclaEf, cantidadAncla: cantAnclaEf,
      rendimiento: rend, desperdicio: desp, pesoUnidad: pu,
    })
    setResultado(res)
  }, [ingredientes, ancla, cantidadAncla, rendimiento, desperdicio, pesoUnidad, modoCalc, unidadesObj])

  useEffect(() => { calcular() }, [calcular])

  // ---- Cargar selección (producto base o receta rápida) ----
  const cargarReceta = (value) => {
    setSelValue(value)
    if (!value) { limpiar(); return }

    const [tipo, idStr] = value.split('-')
    const fuente = tipo === 'prod'
      ? productos.find(x => String(x.id) === idStr)
      : recetas.find(x => String(x.id) === idStr)
    if (!fuente) { limpiar(); return }

    // recetaSelId solo se setea si es una receta rápida (editable in-place)
    setRecetaSelId(tipo === 'recipe' ? fuente.id : '')

    setNombre(fuente.nombre || '')
    setRendimiento(fuente.rendimiento || 62)
    setDesperdicio(fuente.desperdicio || 2)
    setPesoUnidad(fuente.peso_unidad || 1000)
    setPorciona(!!fuente.porciona)
    setPesoSubporcion(fuente.peso_subporcion || '')
    setBrix(fuente.brix || 75)
    setBrixAplica(!!fuente.brix_aplica)
    setParamsCalidad(Array.isArray(fuente.parametros_calidad) ? fuente.parametros_calidad : (() => { try { return JSON.parse(fuente.parametros_calidad || '[]') } catch { return [] } })())
    // los productos no almacenan ancla; las recetas rápidas sí
    setAncla(fuente.ancla || '')
    setCantAncla(fuente.cantidad_ancla || '')
    setImgData(fuente.imagen_url || '')
    setFichaNombre(fuente.ficha_nombre || '')
    setFichaStoragePath(fuente.ficha_url || '')
    setFichaFile(null)

    const ings = Array.isArray(fuente.ingredientes) ? fuente.ingredientes : JSON.parse(fuente.ingredientes || '[]')
    setIngredientes(ings.map(i => {
      // Resolver MP por id; si es manual, intentar vincular por nombre con una MP existente
      let mp = i.mpId ? mps.find(m => String(m.id) === String(i.mpId)) : null
      if (!mp && !i.mpId && (i.nombre || '').trim())
        mp = mps.find(m => (m.nombre || '').trim().toLowerCase() === (i.nombre || '').trim().toLowerCase())
      const mpIdEf = i.mpId || (mp ? mp.id : '')
      const nombre = i.nombre || mp?.nombre || ''
      return {
        _id:  Date.now() + Math.random(),
        nombre,
        pct: i.pct || '',
        precio: i.precio || (mp ? String(mp.precio) : ''),
        // los productos almacenan "cantidad" (g/bache); las recetas rápidas usan "gramos"
        gramos: i.gramos || i.cantidad || '',
        mpId: mpIdEf,
        modo: mpIdEf ? 'lista' : 'manual',
        tipo: i.tipo || 'normal',
        base: i.base || (i.tipo === 'relativo' ? '' : 'total'),
        _base: tipo === 'prod',   // marca las filas originales de una receta base (producto)
      }
    }))

    if (tipo === 'prod') toast(`Producto base "${fuente.nombre}" cargado — calcula o guarda como receta rápida`)
  }

  // ---- Helpers de ingredientes ----
  const EMPTY_ING_BASE = { pct: '', precio: '', gramos: '', mpId: '', modo: 'lista' }
  // Enviar la receta a una nueva orden de producción (precarga producto/cantidad/origen)
  const enviarAOrden = () => {
    if (!nombre.trim()) { toast('Ponle nombre a la receta antes de enviarla a una orden', 'warning'); return }
    navigate('/ordenes', { state: { nuevaOrden: {
      producto: nombre,
      origen: recetaSelId ? 'receta' : 'producto',
      origen_id: recetaSelId ? String(recetaSelId) : '',
      cantidad_plan: resultado?.unidades ? String(Math.round(resultado.unidades)) : '',
      ancla: ancla || '', cantidad_ancla: cantidadAncla || '',
    } } })
  }

  const addIngNormal   = () => setIngredientes(p => [...p, { ...EMPTY_ING_BASE, _id: Date.now() + Math.random(), nombre: '', tipo: 'normal',   base: 'total' }])
  const addIngRelativo = () => setIngredientes(p => [...p, { ...EMPTY_ING_BASE, _id: Date.now() + Math.random(), nombre: '', tipo: 'relativo', base: [] }])
  const updIng = (id, field, val) => setIngredientes(p => p.map(r => r._id === id ? { ...r, [field]: val } : r))
  const delIng = (id) => setIngredientes(p => p.filter(r => r._id !== id))

  // Auto-vincula ingredientes escritos a mano que coincidan por nombre con una MP ya registrada.
  useEffect(() => {
    if (!mps.length) return
    setIngredientes(prev => {
      let changed = false
      const next = prev.map(i => {
        if (i.mpId) return i
        const nom = (i.nombre || '').trim().toLowerCase()
        if (!nom) return i
        const mp = mps.find(m => (m.nombre || '').trim().toLowerCase() === nom)
        if (mp) { changed = true; return { ...i, mpId: mp.id, modo: 'lista', precio: mp.precio } }
        return i
      })
      return changed ? next : prev
    })
  }, [mps])

  // Seleccionar MP de la lista → autocompleta nombre y precio
  const handleSelectMP = (id, mpId) => {
    const mp = mps.find(m => String(m.id) === String(mpId))
    setIngredientes(prev => prev.map(r =>
      r._id === id
        ? { ...r, mpId, nombre: mp ? mp.nombre : '', precio: mp ? String(mp.precio) : '' }
        : r
    ))
  }

  // Cambiar modo: al pasar a 'lista' limpia nombre/mpId; al pasar a 'manual' conserva nombre
  const toggleModo = (id, modo) => {
    setIngredientes(prev => prev.map(r =>
      r._id === id
        ? { ...r, modo, mpId: '', nombre: modo === 'lista' ? '' : r.nombre, precio: modo === 'lista' ? '' : r.precio }
        : r
    ))
  }

  const nombresIng = ingredientes.map(i => i.nombre).filter(Boolean)
  const ordIng = useReorder(setIngredientes)

  // Al editar el % de un normal: para que los porcentajes ESCRITOS por el usuario se sostengan
  // (y no se "descuadren" recalculándose entre sí), se trabaja SIEMPRE contra un peso total fijo:
  // si el usuario no lo ha definido, se congela automáticamente el total actual de gramos la
  // primera vez que edita un %. Así % → gramos es determinista y cada % queda tal cual se escribió.
  const handlePctChange = (id, val) => {
    let totalFijo = parseFloat(pesoTotalMezcla) || 0
    if (!(totalFijo > 0)) {
      const totalActual = ingredientes.reduce((s, r) => r.tipo === 'normal' ? s + (parseFloat(r.gramos) || 0) : s, 0)
      if (totalActual > 0) {
        totalFijo = Math.round(totalActual * 10) / 10
        setPesoTotalMezcla(String(totalFijo))
        toast(`Peso total de la mezcla fijado en ${totalFijo} g para que los % se mantengan — puedes cambiarlo arriba`, 'info')
      }
    }
    setIngredientes(prev => {
      const pct = parseFloat(val) || 0
      // Con peso total fijo: gramos = % × total / 100 (determinista, los demás % no se tocan)
      if (totalFijo > 0) {
        return prev.map(r => r._id === id ? { ...r, pct: val, gramos: pct > 0 ? (pct / 100 * totalFijo).toFixed(1) : '' } : r)
      }
      // Sin total (receta vacía): solo guarda el % escrito
      return prev.map(r => r._id === id ? { ...r, pct: val } : r)
    })
  }

  // Actualiza gramos + recalcula pct de TODOS los normales en un solo setState
  // Usa el valor nuevo (val) para la fila actual, evitando el estado stale
  const handleGramosChange = (id, val) => {
    const totalFijo = parseFloat(pesoTotalMezcla) || 0
    setIngredientes(prev => {
      // Si hay peso total fijo: % = gramos / total × 100 (determinista)
      if (totalFijo > 0) {
        return prev.map(r => {
          const newGramos = r._id === id ? val : r.gramos
          if (r.tipo !== 'normal') return { ...r, gramos: newGramos }
          const g = r._id === id ? parseFloat(val) || 0 : parseFloat(r.gramos) || 0
          return { ...r, gramos: newGramos, pct: g > 0 ? (g / totalFijo * 100).toFixed(3) : r.pct }
        })
      }
      const totalGramos = prev.reduce((s, r) => {
        if (r.tipo !== 'normal') return s
        return s + (r._id === id ? parseFloat(val) || 0 : parseFloat(r.gramos) || 0)
      }, 0)
      return prev.map(r => {
        const newGramos = r._id === id ? val : r.gramos
        if (r.tipo !== 'normal') return { ...r, gramos: newGramos }
        const g = r._id === id ? parseFloat(val) || 0 : parseFloat(r.gramos) || 0
        return { ...r, gramos: newGramos, pct: totalGramos > 0 ? (g / totalGramos * 100).toFixed(3) : r.pct }
      })
    })
  }

  const totalPctNormales = ingredientes.filter(r => r.tipo === 'normal').reduce((s, r) => s + (parseFloat(r.pct) || 0), 0)

  // Imagen
  const handleImg = (e) => { const file = e.target.files[0]; e.target.value = ''; if (file) setCropRec(file) }
  const recortada = (blob) => { setCropRec(null); const r = new FileReader(); r.onload = ev => setImgData(ev.target.result); r.readAsDataURL(blob) }

  // Ficha técnica
  const handleFicha = (e) => {
    const file = e.target.files[0]; if (!file) return
    setFichaFile(file); setFichaNombre(file.name)
    toast('Ficha cargada: ' + file.name + ' ✓')
  }

  // Descarga usando el SDK (funciona con buckets privados)
  const descargarFicha = async (storagePath, nombre) => {
    if (!storagePath) { toast('Esta receta no tiene ficha adjunta', 'warning'); return }
    try {
      const { data, error } = await supabase.storage.from('technical-sheets').download(storagePath)
      if (error) throw error
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url; a.download = nombre || 'ficha_tecnica'
      document.body.appendChild(a); a.click()
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 300)
    } catch (err) {
      toast('Error al descargar: ' + err.message, 'error')
    }
  }

  // ---- Guardar SIEMPRE como receta rápida (nunca toca productos) ----
  const guardarReceta = async () => {
    if (!nombre.trim()) { toast('Ingresa el nombre de la receta', 'warning'); return }
    if (!ingredientes.length) { toast('Agrega ingredientes', 'warning'); return }
    // Evitar nombres duplicados (con productos/recetas base o con otras recetas rápidas).
    // Si choca, se le agrega la fecha al final para hacerlo único.
    let nombreFinal = nombre.trim()
    const norm = (s) => (s || '').trim().toLowerCase()
    const choca = productos.some(p => norm(p.nombre) === norm(nombreFinal))
      || recetas.some(r => norm(r.nombre) === norm(nombreFinal) && String(r.id) !== String(recetaSelId))
    if (choca) {
      nombreFinal = `${nombreFinal} (${new Date().toLocaleDateString('es-CO')})`
      setNombre(nombreFinal)
      toast('Ya existe una receta con ese nombre — se guardó con la fecha añadida', 'info')
    }
    setSaving(true)
    try {
      let fichaPath = fichaStoragePath
      if (fichaFile) {
        const ext = fichaFile.name.split('.').pop()
        fichaPath = `fichas/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('technical-sheets')
          .upload(fichaPath, fichaFile, { upsert: true })
        if (upErr) throw upErr
        setFichaStoragePath(fichaPath)
      }
      const datos = {
        // 'normal' es el valor permitido por el CHECK de la tabla recipes; lo mostramos como "Rápida"
        nombre: nombreFinal, tipo: 'normal', brix: parseFloat(brix) || 75, brix_aplica: brixAplica,
        rendimiento: parseFloat(rendimiento) || 62, desperdicio: parseFloat(desperdicio) || 2,
        peso_unidad: parseFloat(pesoUnidad) || 1000,
        porciona, peso_subporcion: porciona ? (parseFloat(pesoSubporcion) || 0) : null,
        parametros_calidad: paramsCalidad.filter(pc => pc.nombre?.trim()),
        ingredientes: JSON.stringify(ingredientes),
        ancla, cantidad_ancla: parseFloat(cantidadAncla) || 0,
        imagen_url: imgData, ficha_nombre: fichaNombre,
        ficha_url: fichaPath || '',
        creado_por: profile?.nombre || '',
        fecha: new Date().toISOString().split('T')[0],
      }
      // recetaSelId solo existe si se cargó una receta rápida → update; cualquier otro caso → insert
      if (recetaSelId) {
        await supabase.from('recipes').update(datos).eq('id', recetaSelId)
        toast('💾 Receta rápida actualizada ✓')
      } else {
        await supabase.from('recipes').insert(datos)
        toast('💾 Receta rápida guardada ✓')
      }
      refetchRecetas()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Convertir la receta rápida cargada en producto base (receta ancla).
  // Si tiene ingredientes que no están en MP, ofrece agregarlos.
  const convertirABase = async () => {
    const faltantes = ingredientes.filter(i => !i.mpId && (i.nombre || '').trim())
    if (faltantes.length) {
      const ok = await confirmar(
        `Esta receta tiene ingredientes que no están en la lista de Materias Primas:\n${faltantes.map(i => '• ' + i.nombre).join('\n')}\n\n¿Deseas agregarlos a Materias Primas?`,
        { title: 'Ingredientes sin registrar', confirmText: 'Sí, agregar', cancelText: 'No, continuar' }
      )
      if (ok) { navigate('/inventario', { state: { nuevasMP: faltantes.map(i => i.nombre) } }); return }
    }
    onConvertir?.(recetaSelId)
  }

  const eliminarReceta = async (id, nombre = '') => {
    if (!(await confirmar(`¿Eliminar permanentemente la receta${nombre ? ` "${nombre}"` : ''}?\nEsta acción no se puede deshacer.`))) return
    await supabase.from('recipes').delete().eq('id', id)
    refetchRecetas()
    if (String(recetaSelId) === String(id)) limpiar()
    toast('Receta eliminada permanentemente')
  }

  const limpiar = () => {
    setSelValue(''); setRecetaSelId(''); setNombre(''); setIngredientes([])
    setAncla(''); setCantAncla(''); setModoCalc('ancla'); setUnidadesObj(''); setRendimiento(62); setDesperdicio(2); setPesoUnidad(1000)
    setPorciona(false); setPesoSubporcion(''); setParamsCalidad([])
    setBrix(75); setBrixAplica(false); setImgData(''); setFichaNombre(''); setFichaFile(null); setFichaStoragePath('')
    setResultado(null)
  }

  // True cuando se ha cargado un producto base (su imagen se edita en Ficha de Producto)
  const esBase = selValue.startsWith('prod-')

  // ---- Permisos finos ----
  // El operario, al cargar una receta base, no edita parámetros ni borra filas base
  // hasta que agrega una fila nueva. El auxiliar es de solo lectura.
  const recetaModificada = ingredientes.some(i => !i._base)
  const paramsBloqueados = soloLectura || (esOperario && esBase && !recetaModificada)
  const puedeAgregarIng  = !soloLectura
  const puedeGuardar     = !soloLectura
  const puedeLimpiar     = esAdmin   // operario y auxiliar: sin "Limpiar"
  const puedeEditarFicha = esAdmin   // operario y auxiliar: ficha solo descarga
  // ¿Se puede eliminar esta fila de ingrediente?
  const puedeEliminarFila = (r) => !soloLectura && !(esOperario && r._base)
  // ¿Se puede eliminar esta receta rápida guardada? Operario solo las suyas; admin todas.
  const puedeEliminarReceta = (r) => esAdmin || (esOperario && (r.creado_por || '') === (profile?.nombre || '__nadie__'))

  // Lista combinada para "Recetas Guardadas": productos (base) + recetas rápidas
  const filasGuardadas = [
    ...productos.map(p => ({ ...p, _origen: 'prod' })),
    ...recetas.map(r => ({ ...r, _origen: 'recipe' })),
  ]

  return (
    <div>
      {!embedded && (
        <div className="page-header">
          <h1 className="page-title">Calcular Recetas Rápidas o de Prueba</h1>
        </div>
      )}

      <div className="card">
        <div className="card-title">🧪 Calculadora por Ingrediente Ancla</div>
        <div className="alert alert-info" style={{ fontSize: '0.88rem' }}>
          Ingresa la cantidad de un ingrediente ancla y el sistema calcula el resto de la receta, peso esperado, rendimiento, unidades y costos.
        </div>

        {/* Selector + nombre + imagen */}
        <div className="grid-resp" style={{ gridTemplateColumns: '1fr 1fr auto', gap: 16, marginBottom: 20, alignItems: 'end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Cargar receta existente</label>
            <select className="form-control" value={selValue} onChange={e => cargarReceta(e.target.value)}>
              <option value="">— nueva receta —</option>
              {productos.length > 0 && <optgroup label="⭐ Recetas Base (productos)">{productos.map(p => <option key={p.id} value={`prod-${p.id}`}>⭐ {p.nombre}</option>)}</optgroup>}
              {!esAuxiliar && recetas.length > 0 && <optgroup label="💾 Recetas Rápidas">{recetas.map(r => <option key={r.id} value={`recipe-${r.id}`}>💾 {r.nombre}</option>)}</optgroup>}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Nombre de la receta</label>
            <input className="form-control" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Dulce Mumi de Seje" />
          </div>
          <div>
            <label className="form-label">Imagen {esBase && <span style={{ fontSize: '0.7rem', color: 'var(--texto-suave)', fontWeight: 400 }}>(producto)</span>}</label>
            <div
              onClick={() => { if (!esBase) imgInputRef.current?.click() }}
              title={esBase ? 'La imagen del producto se edita en Ficha de Producto' : 'Cambiar imagen'}
              style={{ position: 'relative', width: 64, height: 64, border: '2px dashed var(--crema-oscuro)', borderRadius: 'var(--radio)', overflow: 'hidden', cursor: esBase ? 'not-allowed' : 'pointer', opacity: esBase ? 0.7 : 1 }}
            >
              {imgData ? <img src={imgData} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="receta" /> : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '1.4rem' }}>📷</div>}
              {!esBase && <input type="file" accept="image/*" ref={imgInputRef} onChange={handleImg} style={{ display: 'none' }} />}
            </div>
            {cropRec && <ImageCropper file={cropRec} aspect={1} salidaW={1000} salidaH={1000} onCancel={() => setCropRec(null)} onCropped={recortada} />}
          </div>
        </div>

        <div className="grid-resp" style={{ gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Columna izquierda */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <strong style={{ color: 'var(--selva)', fontSize: '0.95rem' }}>📋 Ingredientes</strong>
              <label style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                Peso total mezcla (g):
                <input type="number" className="form-control" style={{ width: 120 }} value={pesoTotalMezcla} disabled={soloLectura} onChange={e => setPesoTotalMezcla(e.target.value)} placeholder="Ej: 1000" />
              </label>
              {puedeAgregarIng && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-xs btn-secondary" onClick={addIngNormal}>+ Normal</button>
                  <button className="btn btn-xs btn-dorado" onClick={addIngRelativo}>+ Relativo a...</button>
                </div>
              )}
            </div>
            {parseFloat(pesoTotalMezcla) > 0 && <div style={{ fontSize: '0.72rem', color: 'var(--texto-suave)', marginBottom: 6 }}>Con el peso total fijo: al escribir <strong>%</strong> se calculan los <strong>gramos</strong> y viceversa.</div>}
            {/* Header columnas */}
            <div className="ed-head" style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 0.8fr 0.8fr 44px', gap: 5, padding: '4px 0', fontSize: '0.7rem', fontWeight: 700, color: 'var(--texto-suave)', textTransform: 'uppercase' }}>
              <span>Ingrediente</span><span style={{ textAlign: 'right' }}>% receta</span><span style={{ textAlign: 'right' }}>g (opc.)</span><span style={{ textAlign: 'right' }}>$/Kg</span><span></span>
            </div>
            {ingredientes.map((r, idx) => {
              const esRelativo = r.tipo === 'relativo'
              const accentColor = esRelativo ? 'var(--dorado)' : undefined
              return (
                <div key={r._id} className={ordIng.rowClassName(idx)} {...ordIng.rowProps(idx)} style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 0.8fr 0.8fr 44px', gap: 5, marginBottom: 8, alignItems: 'start' }}>

                  {/* ---- Asa de arrastre + Columna nombre: toggle lista/manual + input/select ---- */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                    <span {...ordIng.handleProps(idx)}>⠿</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
                    {/* Toggle modo */}
                    <div style={{ display: 'flex' }}>
                      {['lista','manual'].map((m, i) => (
                        <button
                          key={m}
                          type="button"
                          disabled={soloLectura}
                          onClick={() => toggleModo(r._id, m)}
                          style={{
                            flex: 1, padding: '2px 0', fontSize: '0.67rem', cursor: soloLectura ? 'default' : 'pointer',
                            fontFamily: "'Source Sans 3', sans-serif", fontWeight: 600,
                            background: r.modo === m ? (esRelativo ? 'var(--tierra)' : 'var(--selva)') : 'transparent',
                            color: r.modo === m ? 'var(--crema)' : 'var(--texto-suave)',
                            border: `1px solid ${r.modo === m ? (esRelativo ? 'var(--tierra)' : 'var(--selva)') : 'var(--crema-oscuro)'}`,
                            borderRadius: i === 0 ? '3px 0 0 3px' : '0 3px 3px 0',
                            marginLeft: i === 1 ? -1 : 0,
                          }}
                        >
                          {m === 'lista' ? '📦 Lista' : '✏ Manual'}
                        </button>
                      ))}
                    </div>

                    {/* Input según modo */}
                    {r.modo === 'manual'
                      ? <input
                          className="form-control"
                          placeholder="Nombre ingrediente"
                          value={r.nombre}
                          disabled={soloLectura}
                          onChange={e => updIng(r._id, 'nombre', e.target.value)}
                          style={{ borderColor: accentColor }}
                        />
                      : <BuscadorSelect value={r.mpId || ''} disabled={soloLectura} placeholder="Escribe para buscar la MP..."
                          opciones={mps.map(m => ({ value: String(m.id), label: m.nombre, sub: `${fCOP(m.precio)}/${m.unidad}` }))}
                          onSelect={(v) => handleSelectMP(r._id, v)} />
                    }

                    {/* Selector "relativo a" (uno o varios) solo para tipo relativo */}
                    {esRelativo && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '0.72rem', color: 'var(--tierra)' }}>
                        <span>relativo a la suma de (marca uno o varios):</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px', border: '1px solid var(--dorado)', borderRadius: 4, padding: '4px 6px', maxHeight: 90, overflowY: 'auto' }}>
                          {nombresIng.filter(n => n !== r.nombre).length === 0
                            ? <span style={{ color: 'var(--texto-suave)' }}>Agrega ingredientes normales primero</span>
                            : nombresIng.filter(n => n !== r.nombre).map(n => {
                              const sel = Array.isArray(r.base) ? r.base : (r.base ? [r.base] : [])
                              const checked = sel.includes(n)
                              return (
                                <label key={n} style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: soloLectura ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
                                  <input type="checkbox" checked={checked} disabled={soloLectura} onChange={() => updIng(r._id, 'base', checked ? sel.filter(x => x !== n) : [...sel, n])} />
                                  {n}
                                </label>
                              )
                            })}
                        </div>
                      </div>
                    )}
                    </div>
                  </div>

                  {/* % */}
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input type="number" className="form-control" placeholder="0" value={r.pct} disabled={soloLectura} onFocus={e => e.target.select()} onChange={e => esRelativo ? updIng(r._id, 'pct', e.target.value) : handlePctChange(r._id, e.target.value)} step="0.01" style={{ textAlign: 'right', paddingRight: 18, borderColor: accentColor }} />
                    <span style={{ position: 'absolute', right: 6, fontSize: '0.78rem', color: 'var(--texto-suave)', pointerEvents: 'none' }}>%</span>
                  </div>
                  {/* g */}
                  <input type="number" className="form-control" placeholder="g" value={r.gramos || ''} disabled={soloLectura} onFocus={e => e.target.select()} onChange={e => handleGramosChange(r._id, e.target.value)} style={{ textAlign: 'right', background: esRelativo ? 'rgba(200,169,74,0.1)' : 'rgba(124,179,66,0.08)', borderColor: accentColor }} />
                  {/* $/Kg — editable aunque venga de lista */}
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <span style={{ position: 'absolute', left: 6, fontSize: '0.78rem', color: 'var(--texto-suave)', pointerEvents: 'none' }}>$</span>
                    <MoneyInput value={r.precio} disabled={soloLectura} onChange={v => updIng(r._id, 'precio', v)} style={{ paddingLeft: 16, borderColor: accentColor, background: r.modo === 'lista' && r.mpId ? 'rgba(124,179,66,0.06)' : undefined }} />
                  </div>
                  {/* Reordenar + eliminar */}
                  <div className="ed-controls" style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 4 }}>
                    {puedeEliminarFila(r)
                      ? <button className="btn btn-danger btn-xs" onClick={() => delIng(r._id)}>✕</button>
                      : (esOperario && r._base) ? <span title="Ingrediente de la receta base — no se puede eliminar" style={{ color: 'var(--texto-suave)', fontSize: '0.8rem' }}>🔒</span> : null}
                  </div>
                </div>
              )
            })}
            <div style={{ fontSize: '0.8rem', marginTop: 6, height: 18, color: Math.abs(totalPctNormales - 100) > 0.5 ? 'var(--rojo)' : 'var(--lima)' }}>
              {ingredientes.length > 0 && (Math.abs(totalPctNormales - 100) > 0.5
                ? `⚠ % normales suman: ${totalPctNormales.toFixed(2)}% (idealmente 100%)`
                : `✅ % normales: ${totalPctNormales.toFixed(2)}%`)
              }
            </div>

            <hr className="divider" />

            {/* Parámetros */}
            <div style={{ marginTop: 14, padding: 14, background: 'var(--crema)', borderRadius: 'var(--radio)' }}>
              <div style={{ fontWeight: 600, color: 'var(--selva)', marginBottom: 10, fontSize: '0.88rem' }}>
                ⚙️ Parámetros de Producción {paramsBloqueados && <span style={{ fontWeight: 400, fontSize: '0.75rem', color: 'var(--texto-suave)' }}>🔒 {esOperario ? 'agrega un ingrediente nuevo para editarlos' : 'solo lectura'}</span>}
              </div>
              <div className="form-grid-2" style={{ gap: 10 }}>
                <div className="form-group" style={{ margin: 0 }}><label className="form-label">Rendimiento esperado (%)</label><input type="number" className="form-control" value={rendimiento} disabled={paramsBloqueados} onChange={e => setRendimiento(e.target.value)} min={1} max={100} step={0.1} /></div>
                <div className="form-group" style={{ margin: 0 }}><label className="form-label">% Desperdicio</label><input type="number" className="form-control" value={desperdicio} disabled={paramsBloqueados} onChange={e => setDesperdicio(e.target.value)} min={0} max={50} step={0.1} /></div>
                <div className="form-group" style={{ margin: 0 }}><label className="form-label">Peso por caja/unidad (g)</label><input type="number" className="form-control" value={pesoUnidad} disabled={paramsBloqueados} onChange={e => setPesoUnidad(e.target.value)} min={1} /></div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: paramsBloqueados ? 'default' : 'pointer', fontWeight: 600, color: 'var(--selva)', minHeight: '1.2rem' }}>
                    <input type="checkbox" checked={porciona} disabled={paramsBloqueados} onChange={e => setPorciona(e.target.checked)} />
                    Se porciona
                  </label>
                  {porciona
                    ? <input type="number" className="form-control" value={pesoSubporcion} disabled={paramsBloqueados} onChange={e => setPesoSubporcion(e.target.value)} min={1} placeholder="Peso subporción (g)" style={{ marginTop: 4 }} />
                    : <div style={{ fontSize: '0.72rem', color: 'var(--texto-suave)', marginTop: 6 }}>Subporciones por unidad</div>}
                  {porciona && (parseFloat(pesoSubporcion) || 0) > 0 && (
                    <small style={{ color: 'var(--texto-suave)', fontSize: '0.72rem' }}>
                      {((parseFloat(pesoUnidad) || 0) / parseFloat(pesoSubporcion)).toFixed(1)} subporciones por unidad de {fNum(parseFloat(pesoUnidad) || 0)} g
                    </small>
                  )}
                </div>
              </div>

              {/* Parámetros de calidad */}
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--crema-oscuro)' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, color: 'var(--selva)', fontSize: '0.85rem' }}>🧪 Parámetros de Calidad</div>
                  {!paramsBloqueados && <button type="button" className="btn btn-xs btn-secondary" style={{ marginLeft: 'auto' }} onClick={addParamCalidad}>+ Agregar</button>}
                </div>
                <datalist id="dl-params-receta">{CATALOGO_PARAMS.map(g => g.items.map(i => <option key={i.nombre} value={i.nombre}>{g.grupo}</option>))}</datalist>
                {paramsCalidad.length === 0
                  ? <p style={{ fontSize: '0.78rem', color: 'var(--texto-suave)' }}>Sin parámetros (Brix, pH, % humedad, proteínas...).</p>
                  : paramsCalidad.map((pc, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.8fr auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                      <input className="form-control" list="dl-params-receta" placeholder="Parámetro" value={pc.nombre} disabled={paramsBloqueados} onChange={e => updParamCalidad(i, 'nombre', e.target.value)} />
                      <input className="form-control" placeholder="Valor" value={pc.valor} disabled={paramsBloqueados} onChange={e => updParamCalidad(i, 'valor', e.target.value)} />
                      <input className="form-control" placeholder="Unidad" value={pc.unidad} disabled={paramsBloqueados} onChange={e => updParamCalidad(i, 'unidad', e.target.value)} />
                      {!paramsBloqueados && <button type="button" className="btn btn-danger btn-xs" onClick={() => delParamCalidad(i)}>✕</button>}
                    </div>
                  ))}
              </div>

            </div>

            {/* Ficha técnica */}
            <div style={{ marginTop: 14, padding: 14, background: 'var(--crema)', borderRadius: 'var(--radio)' }}>
              <div style={{ fontWeight: 600, color: 'var(--selva)', marginBottom: 8, fontSize: '0.88rem' }}>📄 Ficha Técnica (instrucciones paso a paso)</div>
              {fichaNombre && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '8px 10px', background: 'rgba(124,179,66,0.08)', borderRadius: 'var(--radio)', border: '1px solid rgba(124,179,66,0.2)' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--selva-claro)', flex: 1 }}>📄 <strong>{fichaNombre}</strong></span>
                  {fichaStoragePath && !fichaFile && (
                    <button className="btn btn-xs btn-dorado" onClick={() => descargarFicha(fichaStoragePath, fichaNombre)}>
                      ⬇ Descargar
                    </button>
                  )}
                  {fichaFile && <span style={{ fontSize: '0.75rem', color: 'var(--texto-suave)' }}>pendiente de guardar</span>}
                </div>
              )}
              <small style={{ color: 'var(--texto-suave)', fontSize: '0.78rem' }}>
                {fichaNombre
                  ? 'Solo descarga disponible. La ficha técnica se sube al crear/editar el producto en Ficha de Producto.'
                  : 'Sin ficha técnica. Se sube al crear/editar el producto en Ficha de Producto.'}
              </small>
            </div>
          </div>

          {/* Columna derecha: resultados */}
          <div>
            {/* Cálculo de la receta (por ingrediente ancla o por unidades a fabricar) */}
            <div style={{ background: 'var(--selva)', color: 'var(--crema)', borderRadius: 'var(--radio)', padding: 16, marginBottom: 14 }}>
              {/* Selector de modo */}
              <div style={{ display: 'flex', marginBottom: 12 }}>
                {[['ancla', '🎯 Por ingrediente ancla'], ['unidades', '📦 Por unidades a fabricar']].map(([m, lbl], i) => (
                  <button key={m} type="button" onClick={() => setModoCalc(m)} style={{
                    flex: 1, padding: '6px 4px', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600,
                    background: modoCalc === m ? 'var(--dorado)' : 'rgba(8,72,11,0.4)',
                    color: modoCalc === m ? 'var(--selva)' : 'rgba(245,240,232,0.7)',
                    border: '1px solid rgba(200,169,74,0.4)',
                    borderRadius: i === 0 ? '4px 0 0 4px' : '0 4px 4px 0', marginLeft: i === 1 ? -1 : 0,
                  }}>{lbl}</button>
                ))}
              </div>

              {modoCalc === 'ancla' ? (
                <>
                  <div style={{ fontSize: '0.82rem', opacity: 0.65, marginBottom: 10 }}>El ingrediente del que tienes cantidad disponible — el resto se calcula a partir de él</div>
                  <div className="form-grid-2" style={{ gap: 10 }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ color: 'rgba(245,240,232,0.7)' }}>Ingrediente ancla</label>
                      <select className="form-control" value={ancla} onChange={e => setAncla(e.target.value)} style={{ background: 'rgba(8, 72, 11, 0.55)', color: 'white', borderColor: 'rgba(200,169,74,0.4)' }}>
                        <option value="">Seleccionar...</option>
                        {nombresIng.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ color: 'rgba(245,240,232,0.7)' }}>Cantidad disponible (g)</label>
                      <input type="number" className="form-control" value={cantidadAncla} onChange={e => setCantAncla(e.target.value)} placeholder="Ej: 7000" style={{ background: 'rgba(8, 72, 11, 0.55)', color: 'white', borderColor: 'rgba(200,169,74,0.4)' }} />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '0.82rem', opacity: 0.65, marginBottom: 10 }}>Indica cuántas unidades de producto quieres fabricar y se calculan todos los ingredientes.</div>
                  <div className="form-group" style={{ margin: 0, maxWidth: 220 }}>
                    <label className="form-label" style={{ color: 'rgba(245,240,232,0.7)' }}>Unidades a fabricar</label>
                    <input type="number" className="form-control" value={unidadesObj} onChange={e => setUnidadesObj(e.target.value)} placeholder="Ej: 100" min={1} style={{ background: 'rgba(8, 72, 11, 0.55)', color: 'white', borderColor: 'rgba(200,169,74,0.4)' }} />
                  </div>
                  <div style={{ fontSize: '0.72rem', opacity: 0.6, marginTop: 8 }}>
                    Usa el rendimiento, el desperdicio y el peso por unidad de los parámetros para calcular la mezcla total necesaria.
                  </div>
                </>
              )}
            </div>

            <div style={{ fontWeight: 600, color: 'var(--selva)', marginBottom: 10, fontSize: '0.95rem' }}>📊 Resultados</div>

            <div style={{ background: 'var(--blanco)', border: '1px solid var(--crema-oscuro)', borderRadius: 'var(--radio)', overflow: 'hidden', marginBottom: 14 }}>
              <table>
                <thead><tr><th>Ingrediente</th><th className="td-number">Cantidad (g)</th><th className="td-number">Costo total</th></tr></thead>
                <tbody>
                  {resultado
                    ? resultado.calculados.map((r, i) => (
                      <tr key={i}>
                        <td>
                          {r.tipo === 'relativo' && <span style={{ color: 'var(--tierra)', fontSize: '0.8rem' }}>↳ </span>}
                          <strong>{r.nombre}</strong>
                          {r.nombre === ancla && <span className="badge badge-dorado" style={{ fontSize: '0.65rem', marginLeft: 4 }}>ANCLA</span>}
                          {r.tipo === 'relativo' && r.base?.length > 0 && <span className="badge badge-gris" style={{ fontSize: '0.65rem', marginLeft: 4 }}>% sobre {(Array.isArray(r.base) ? r.base : [r.base]).join(' + ')}</span>}
                        </td>
                        <td className="td-number">{r.cantidad.toFixed(1)} g</td>
                        <td className="td-number">{fCOP(r.costoTotal)}</td>
                      </tr>
                    ))
                    : <tr><td colSpan={3} className="empty-table">Selecciona ancla y cantidad</td></tr>
                  }
                </tbody>
                {resultado && (
                  <tfoot>
                    <tr style={{ background: 'var(--selva)', color: 'var(--crema)' }}>
                      <td><strong>TOTAL MEZCLA</strong></td>
                      <td className="td-number"><strong>{resultado.totalMezcla.toFixed(0)} g</strong></td>
                      <td className="td-number"><strong>{fCOP(resultado.totalCostoMP)}</strong></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Datos previstos */}
            {resultado && (
              <div style={{ background: 'var(--selva)', color: 'var(--crema)', borderRadius: 'var(--radio)', padding: 16, marginBottom: 14 }}>
                <div style={{ fontFamily: "'Playfair Display', serif", color: 'var(--dorado)', marginBottom: 12 }}>📦 Datos Previstos</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.88rem' }}>
                  <div><div style={{ opacity: 0.6, fontSize: '0.75rem' }}>Peso total mezcla</div><strong>{resultado.totalMezcla.toFixed(0)} g</strong></div>
                  <div><div style={{ opacity: 0.6, fontSize: '0.75rem' }}>Peso esperado producto</div><strong>{resultado.pesoEsperado.toFixed(1)} g</strong></div>
                  <div><div style={{ opacity: 0.6, fontSize: '0.75rem' }}>Rendimiento</div><strong>{parseFloat(rendimiento).toFixed(1)}%</strong></div>
                  <div><div style={{ opacity: 0.6, fontSize: '0.75rem' }}>Peso desperdicio</div><strong>{resultado.pesoDesp.toFixed(1)} g ({desperdicio}%)</strong></div>
                  <div>
                    <div style={{ opacity: 0.6, fontSize: '0.75rem', marginBottom: 2 }}>Unidades estimadas</div>
                    <strong style={{ fontSize: '1.4rem', color: 'var(--dorado)' }}>{resultado.unidades.toFixed(1)} unid</strong>
                    <div style={{ opacity: 0.6, fontSize: '0.72rem' }}>de {fNum(parseFloat(pesoUnidad) || 0)} g c/u</div>
                  </div>
                  {porciona && (parseFloat(pesoSubporcion) || 0) > 0 && (
                    <div>
                      <div style={{ opacity: 0.6, fontSize: '0.75rem', marginBottom: 2 }}>Subporciones</div>
                      <strong style={{ fontSize: '1.4rem', color: 'var(--dorado)' }}>{(resultado.unidades * ((parseFloat(pesoUnidad) || 0) / parseFloat(pesoSubporcion))).toFixed(0)}</strong>
                      <div style={{ opacity: 0.6, fontSize: '0.72rem' }}>de {fNum(parseFloat(pesoSubporcion) || 0)} g c/u</div>
                    </div>
                  )}
                </div>

                {/* Parámetros de calidad elegidos por el usuario */}
                {paramsCalidad.filter(pc => pc.nombre?.trim()).length > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.15)' }}>
                    <div style={{ opacity: 0.7, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Parámetros de calidad</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.85rem' }}>
                      {paramsCalidad.filter(pc => pc.nombre?.trim()).map((pc, i) => (
                        <div key={i}>
                          <div style={{ opacity: 0.6, fontSize: '0.72rem' }}>{pc.nombre}</div>
                          <strong>{pc.valor || '—'}{pc.unidad ? ' ' + pc.unidad : ''}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Costos MP */}
            {resultado && (
              <div style={{ background: 'var(--crema)', borderRadius: 'var(--radio)', padding: 14, border: '1px solid var(--crema-oscuro)', marginBottom: 14 }}>
                <div style={{ fontWeight: 600, color: 'var(--selva)', marginBottom: 8, fontSize: '0.88rem' }}>💰 Costos de Materia Prima</div>
                <table style={{ fontSize: '0.88rem', width: '100%' }}>
                  <tbody>
                    <tr><td>Total MP</td><td className="td-number"><strong>{fCOP(resultado.totalCostoMP)}</strong></td></tr>
                    <tr><td>Costo MP por unidad</td><td className="td-number">{fCOP(resultado.costoMPcaja)}</td></tr>
                    <tr><td>Costo MP por kilo</td><td className="td-number">{fCOP(resultado.costoMPkilo)}/Kg</td></tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Botones acción */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {puedeLimpiar && <button className="btn btn-secondary btn-sm" onClick={limpiar}>🗑 Limpiar</button>}
              {puedeGuardar && (
                <button className="btn btn-success btn-sm" onClick={guardarReceta} disabled={saving}>
                  {recetaSelId ? '💾 Actualizar receta rápida' : '💾 Guardar receta rápida'}
                </button>
              )}
              <button className="btn btn-primary btn-sm" onClick={enviarAOrden}>📤 Enviar a orden de producción</button>
              {onConvertir && recetaSelId && (
                <button className="btn btn-primary btn-sm" onClick={convertirABase}>⭐ Convertir a receta base (producto)</button>
              )}
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--texto-suave)', marginTop: 8 }}>
              Las <strong>recetas base</strong> son los productos creados en Ficha de Producto. Aquí guardas <strong>recetas rápidas</strong> de prueba.
            </p>
          </div>
        </div>
      </div>

      {/* Tabla combinada: productos (base) + recetas rápidas */}
      <div className="card">
        <div className="card-title">
          📚 Recetas Guardadas
          <span className="badge badge-verde" style={{ marginLeft: 8 }}>{filasGuardadas.length}</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--texto-suave)', fontWeight: 400 }}>
            ⭐ Base = productos (editar en Ficha de Producto) · 💾 Rápida = recetas de prueba
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nombre</th><th>Tipo</th><th>Creado por</th><th>Costo MP</th><th>Fecha</th><th>Acciones</th></tr></thead>
            <tbody>
              {filasGuardadas.length === 0
                ? <tr><td colSpan={6} className="empty-table">No hay recetas ni productos</td></tr>
                : filasGuardadas.map(r => {
                    const esProd = r._origen === 'prod'
                    const ings = Array.isArray(r.ingredientes) ? r.ingredientes : JSON.parse(r.ingredientes || '[]')
                    const res  = (!esProd && r.ancla)
                      ? calcularReceta({ ingredientes: ings, ancla: r.ancla, cantidadAncla: r.cantidad_ancla || 0, rendimiento: r.rendimiento, desperdicio: r.desperdicio, pesoUnidad: r.peso_unidad })
                      : null
                    const key = `${r._origen}-${r.id}`
                    return (
                      <tr key={key}>
                        <td>
                          {r.imagen_url && <img src={r.imagen_url} style={{ width: 32, height: 32, borderRadius: 3, objectFit: 'cover', marginRight: 6, verticalAlign: 'middle' }} alt="" />}
                          <strong>{r.nombre}</strong>
                        </td>
                        <td><span className={`badge ${esProd ? 'badge-dorado' : 'badge-verde'}`}>{esProd ? '⭐ Base' : '💾 Rápida'}</span></td>
                        <td>{r.creado_por || '—'}</td>
                        <td className="td-number">{esProd ? fCOP(r.costo_final || 0) : (res ? fCOP(res.totalCostoMP) : '—')}</td>
                        <td>{fFecha(esProd ? r.fecha_creado : r.fecha)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn btn-xs btn-secondary" onClick={() => cargarReceta(key)}>
                            {esProd ? '📥 Cargar' : '✏ Editar'}
                          </button>{' '}
                          {r.ficha_url && (
                            <button className="btn btn-xs btn-dorado" onClick={() => descargarFicha(r.ficha_url, r.ficha_nombre)}>⬇ Ficha</button>
                          )}{' '}
                          {!esProd && puedeEliminarReceta(r) && <button className="btn btn-xs btn-danger" onClick={() => eliminarReceta(r.id, r.nombre)}>✕</button>}
                        </td>
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
