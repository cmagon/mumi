// ============================================================
// MUMI AMAZONIA — Lógica de negocio (funciones puras)
// Todas las fórmulas migradas exactamente del HTML original
// ============================================================

// ==================== FORMATO ====================
export const fCOP = (n) => '$ ' + Math.round(n || 0).toLocaleString('es-CO')
export const fNum = (n) => Math.round(n || 0).toLocaleString('es-CO')
export const fFecha = (s) => {
  if (!s) return '—'
  try {
    const d = new Date(s + 'T12:00:00')
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return s }
}
// Compone el nombre de un producto SURTIDO entre dos sabores tomando como base el prefijo común.
// Ej: ("Bocadillo Mumi Seje", "Bocadillo Mumi Araza") -> "Bocadillo Mumi Surt. Seje - Araza"
export const componerSurtido = (nombreA, nombreB) => {
  const a = String(nombreA || '').trim(), b = String(nombreB || '').trim()
  if (!a || !b) return ''
  if (a.toLowerCase() === b.toLowerCase()) return a
  const wa = a.split(/\s+/), wb = b.split(/\s+/)
  let i = 0
  while (i < wa.length && i < wb.length && wa[i].toLowerCase() === wb[i].toLowerCase()) i++
  const base = wa.slice(0, i).join(' ')
  const sa = wa.slice(i).join(' ') || a
  const sb = wb.slice(i).join(' ') || b
  return `${base ? base + ' ' : ''}Surt. ${sa} - ${sb}`.replace(/\s+/g, ' ').trim()
}

// Roles base + etiquetas personalizadas (roles creados por el admin)
const ROL_LABELS_BASE = { admin: 'Administrador', operario: 'Operario de Producción', auxiliar: 'Auxiliar de Producción', ventas: 'Ventas', readonly: 'Solo lectura' }
let _rolLabels = {}
export const setRolLabels = (m) => { _rolLabels = m || {} }
export const getRolLabel = (r) => ROL_LABELS_BASE[r] || _rolLabels[r] || r

// ==================== CIF ====================

// Normaliza un ítem CIF a su valor mensual equivalente
export const getCIFMensual = (item) => {
  const v = item.valor || 0
  switch (item.frecuencia) {
    case 'anual':      return v / 12
    case 'trimestral': return v / 3
    case 'semestral':  return v / 6
    default:           return v  // mensual
  }
}

export const getCIFTotalMensual = (cifItems = []) =>
  cifItems.reduce((s, c) => s + getCIFMensual(c), 0)

// Costo por minuto de mano de obra
// Fórmula: CIF_total / (operarios × 22días × 8h × 60min × (1 - 15% improductividad))
export const getCostoMinuto = (cifTotal, operarios = 3, dias = 22, jornadaHoras = 8, improductividad = 0.15) => {
  const minsBrutos = operarios * dias * jornadaHoras * 60
  const minsDisponibles = minsBrutos * (1 - improductividad)
  return minsDisponibles > 0 ? cifTotal / minsDisponibles : 0
}

// CIF proporcional multiproducto (método Punto de Equilibrio Multiproducto)
// % participación producto = unidades_mes_producto / total_unidades_mes_portafolio
// CIF por unidad = CIF_total × % participación / unidades_mes_producto
export const getCIFPorProducto = (cifTotal, productosGuardados = [], unidadesMesActual = 0, cifUnidadesFallback = 600) => {
  if (!productosGuardados.length) {
    return cifTotal / cifUnidadesFallback
  }
  const unidsPortafolio = productosGuardados.reduce(
    (s, p) => s + (p.bache * p.baches_mes * (1 - (p.merma || 0) / 100)), 0
  )
  const totalUnids = unidsPortafolio + unidadesMesActual
  if (totalUnids <= 0) return cifTotal / cifUnidadesFallback
  const pct = unidadesMesActual / totalUnids
  return unidadesMesActual > 0 ? (cifTotal * pct) / unidadesMesActual : 0
}

// Cálculo completo de costos de un producto
export const calcularCostosProducto = ({
  bache = 70,
  bachesMes = 1,
  merma = 0,
  comision = 3,
  precioMayor = 0,
  precioDetal = 0,
  ingredientes = [],
  procesos = [],
  empaque = [],
  cifTotal = 0,
  productosGuardados = [],
  cifUnidadesFallback = 600,
  operariosActivos = 3,
  diasHabiles = 22,
  jornadaHoras = 8,
  improductividad = 0.15,
  adicionales = [],   // costos extra personalizados: [{ descripcion, valor, base: 'unidad'|'bache'|'mes' }]
}) => {
  const costoMin = getCostoMinuto(cifTotal, operariosActivos, diasHabiles, jornadaHoras, improductividad)
  const mermaFrac = merma / 100

  // Costo MP por bache: Σ (precio/presentacion × cantidad)
  const totalMPBache = ingredientes.reduce(
    (s, i) => s + ((i.precio || 0) / (i.presentacion || 1000)) * (i.cantidad || 0), 0
  )

  // Costo MO por bache: Σ (minutos × costo/minuto)
  const totalMOBache = procesos.reduce(
    (s, p) => s + (p.minutos || 0) * costoMin, 0
  )

  // Costo empaque por bache: Σ (precio/presentacion × cantidad)
  const totalEmpBache = empaque.reduce(
    (s, e) => s + ((e.precio || 0) / (e.presentacion || 1)) * (e.cantidad || 0), 0
  )

  const totalMinutos = procesos.reduce((s, p) => s + (p.minutos || 0), 0)
  const unidsBache = bache * (1 - mermaFrac)
  const unidsMesTot = unidsBache * bachesMes

  const mpUnit  = unidsBache > 0 ? totalMPBache / unidsBache : 0
  const moUnit  = unidsBache > 0 ? totalMOBache / unidsBache : 0   // informativo (tiempo × costo fijo/min)
  const empUnit = unidsBache > 0 ? totalEmpBache / unidsBache : 0
  const cifUnit = getCIFPorProducto(cifTotal, productosGuardados, unidsMesTot, cifUnidadesFallback)  // informativo (absorción)

  // ===== Costo del producto (método del Excel) =====
  // El overhead (costos fijos + nómina) se reparte por TIEMPO: costo/minuto = CF ÷ minutos disponibles.
  // Costo unitario = (materias primas + empaque + minutos × costo/minuto) ÷ unidades por bache.
  // Costos adicionales personalizados (depreciación, etc.), convertidos a POR UNIDAD según su base.
  const adicUnit = (Array.isArray(adicionales) ? adicionales : []).reduce((s, a) => {
    const v = parseFloat(a?.valor) || 0
    if ((a?.base) === 'mes')   return s + (unidsMesTot > 0 ? v / unidsMesTot : 0)
    if ((a?.base) === 'bache') return s + (unidsBache > 0 ? v / unidsBache : 0)
    return s + v   // 'unidad' (por defecto): valor directo por unidad
  }, 0)

  const cvu = mpUnit + empUnit                             // solo insumos (materiales), referencia
  const costoTotalUnit = mpUnit + empUnit + moUnit + adicUnit  // costo unitario CON overhead por tiempo + adicionales
  const costoFinal = costoTotalUnit
  const comUnit    = precioMayor * (comision / 100)        // comisión sobre la venta (informativa)
  // Ganancia por unidad = Precio − Costo unitario (igual que la hoja 05 del Excel)
  const utilMayor  = precioMayor - costoTotalUnit
  const utilDetal  = precioDetal - costoTotalUnit
  const margenMayor = utilMayor
  const margenDetal = utilDetal
  // Punto de equilibrio del producto (si fuera único)
  const pe = utilMayor > 0 ? cifTotal / utilMayor : 0

  const totalUnidsTodos = productosGuardados.reduce(
    (s, p) => s + (p.bache * p.baches_mes * (1 - (p.merma || 0) / 100)), 0
  ) + unidsMesTot
  const pctCIF = totalUnidsTodos > 0
    ? (unidsMesTot / totalUnidsTodos * 100).toFixed(1) : '—'

  return {
    totalMPBache, totalMOBache, totalEmpBache, totalMinutos,
    mpUnit, moUnit, empUnit, cifUnit, adicUnit,
    cvu, costoTotalUnit, comUnit, costoFinal,
    margenMayor, margenDetal, utilMayor, utilDetal, pe,
    unidsMesTot, pctCIF, costoMin,
  }
}

// Punto de equilibrio MULTIPRODUCTO (método del Excel):
//   PEq_producto = (CF / MCPT) × %participación,  MCPT = Σ(%participación × margen contribución unitario)
// productos: [{ nombre, precio_mayor, cvu (o costo_variable), bache, baches_mes, merma }]
export const getPEqMultiproducto = (productos = [], cifTotal = 0) => {
  const items = productos.map(p => {
    const q   = (p.bache || 0) * (p.baches_mes || 0) * (1 - (p.merma || 0) / 100)
    const pvu = p.precio_mayor || 0
    const cvu = p.cvu != null ? p.cvu : (p.costo_variable != null ? p.costo_variable : (p.costo_final || 0))
    return { nombre: p.nombre, q, pvu, cvu, mcu: pvu - cvu }
  })
  const qTotal = items.reduce((s, i) => s + i.q, 0)
  const mcpt = qTotal > 0 ? items.reduce((s, i) => s + (i.q / qTotal) * i.mcu, 0) : 0
  return items.map(i => {
    const participacion = qTotal > 0 ? i.q / qTotal : 0
    const pe = mcpt > 0 ? (cifTotal / mcpt) * participacion : 0
    return { ...i, participacion, pe }
  })
}

// Distribución del CIF entre todos los productos guardados
export const getCIFDistribucion = (cifTotal, productos = []) => {
  const items = productos.map(p => ({
    nombre: p.nombre, tipo: p.tipo,
    unidsMes: Math.round(p.bache * p.baches_mes * (1 - (p.merma || 0) / 100)),
  }))
  const totalUnids = items.reduce((s, i) => s + i.unidsMes, 0)
  return items.map(i => {
    const pct     = totalUnids > 0 ? i.unidsMes / totalUnids : 0
    const cifAsig = cifTotal * pct
    const cifUnit  = i.unidsMes > 0 ? cifAsig / i.unidsMes : 0
    return { ...i, pct, cifAsig, cifUnit, totalUnids }
  })
}

// ==================== NÓMINA ====================
export const SMV = 1750905
export const AUX_TRANSP = 249095

// Parámetros de liquidación por defecto (Código Sustantivo del Trabajo, base 2026).
// El admin puede editarlos en el módulo de Parámetros (tabla payroll_settings).
export const PARAMS_NOMINA_DEFAULT = {
  smlmv:         SMV,        // salario mínimo legal mensual vigente
  auxTransporte: AUX_TRANSP, // auxilio de transporte
  topeAuxSMLMV:  2,          // se paga aux. de transporte hasta 2 SMLMV
  horasMes:      230,        // jornada legal mensual (para valor hora)
  horasSemana:   44,         // jornada máxima semanal — Ley 2101/2021 (42 desde jul-2026)
  diasLaboralesSemana: 6,    // días laborales por semana (para días hábiles del rango)
  // Control de descuentos por inasistencia (aplica a contrato por nómina)
  descuentaInasistencia: true,
  modoInasistencia: 'automatico',  // 'automatico' (días hábiles vs asistidos) | 'manual' (marcado en el listado)
  descuentaHorasFaltantes: true,   // descontar también horas no cumplidas de la jornada
  // Deducciones del empleado
  empleado: { salud: 0.04, pension: 0.04 },
  // Provisión de prestaciones sociales
  prestaciones: { cesantias: 0.0833, intCesantias: 0.01, prima: 0.0833, vacaciones: 0.0417 },
  // Aportes del empleador (parafiscales y seguridad social)
  empleador: { salud: 0.085, pension: 0.12, arl: 0.00522, caja: 0.04, icbf: 0.03, sena: 0.02 },
  // Exoneración Ley 1607/2012 (art. 114-1): si salario < 10 SMLMV el empleador no paga salud/ICBF/SENA
  exoneraParafiscales: true,
  // Auxilio de transporte en pago por horas: prorratear por días trabajados (días ÷ 30)
  prorrateaAuxDias: true,
  // Contrato de prestación de servicios (CPS)
  cps: { ibc: 0.40, salud: 0.125, pension: 0.16, retencion: 0 },
  // Tiempo de operación (para el costo fijo por minuto del costeo de productos)
  operacion: { dias: 22, jornadaHoras: 8, improductividad: 0.15, numOperarios: 0 },  // numOperarios 0 = usar empleados activos
}
// Compatibilidad con código anterior
export const PARAMS_NOMINA = { ...PARAMS_NOMINA_DEFAULT.prestaciones, ...PARAMS_NOMINA_DEFAULT.empleado }

// Etiquetas de los tipos de pago
export const TIPOS_PAGO = [
  { value: 'nomina',       label: 'Contrato a término fijo/indefinido (nómina)' },
  { value: 'horas',        label: 'Por horas — contrato laboral (con prestaciones)' },
  { value: 'destajo',      label: 'Por destajo / producción (con prestaciones)' },
  { value: 'destajo_hora', label: 'Por hora informal, sin prestaciones (no laboral)' },
  { value: 'cps',          label: 'Contrato prestación de servicios (CPS)' },
]
export const getTipoPagoLabel = (t) => (TIPOS_PAGO.find(x => x.value === t)?.label || t)

// Costo mensual TOTAL de la nómina para el empleador (para incluirlo en los costos fijos / CIF).
// Suma, por cada empleado activo: salario + auxilio + provisión de prestaciones + parafiscales.
// Los CPS se cuentan como honorarios (sin prestaciones ni parafiscales). Igual que la "Planta de Personal" del Excel.
export const getCostoNominaMensual = (empleados = [], params = PARAMS_NOMINA_DEFAULT) => {
  const P = params || PARAMS_NOMINA_DEFAULT
  let salarios = 0, auxilios = 0, prestaciones = 0, parafiscales = 0, honorarios = 0
  for (const e of empleados) {
    if (e.estado && e.estado !== 'activo') continue
    const sal = parseFloat(e.salario) || 0
    if (sal <= 0) continue
    // CPS y pago por hora informal entran al CIF con su SALARIO BASE establecido (sin prestaciones ni parafiscales).
    // En la liquidación de nómina, el destajo_hora se paga por horas asistidas (ver calcularNomina); aquí es solo el costo fijo del CIF.
    if (e.tipo_pago === 'cps' || e.tipo_pago === 'destajo_hora') { honorarios += sal; continue }
    salarios += sal
    const incluyeAux = sal <= P.topeAuxSMLMV * P.smlmv
    auxilios += incluyeAux ? P.auxTransporte : 0
    const ces = sal * P.prestaciones.cesantias
    prestaciones += ces + ces * P.prestaciones.intCesantias + sal * P.prestaciones.prima + sal * P.prestaciones.vacaciones
    const exime = P.exoneraParafiscales && sal < 10 * P.smlmv
    parafiscales += (exime ? 0 : sal * P.empleador.salud) + sal * P.empleador.pension + sal * P.empleador.arl
      + sal * P.empleador.caja + (exime ? 0 : sal * P.empleador.icbf) + (exime ? 0 : sal * P.empleador.sena)
  }
  const total = salarios + auxilios + prestaciones + parafiscales + honorarios
  return { salarios, auxilios, prestaciones, parafiscales, honorarios, total }
}

// Formatea horas decimales a "HH:MM" (horas:minutos). Ej: 8.5 → "8:30".
export const fmtHoras = (h) => {
  const totMin = Math.round((Number(h) || 0) * 60)
  const neg = totMin < 0
  const a = Math.abs(totMin)
  const hh = Math.floor(a / 60), mm = a % 60
  return `${neg ? '-' : ''}${hh}:${String(mm).padStart(2, '0')}`
}

export const calcHoras = (entrada, salida) => {
  if (!entrada || !salida) return 0
  const [eh, em] = entrada.split(':').map(Number)
  const [sh, sm] = salida.split(':').map(Number)
  const mins = (sh * 60 + sm) - (eh * 60 + em)
  return Math.max(0, mins / 60)
}

// Cuenta los días hábiles (laborales) entre dos fechas YYYY-MM-DD inclusive
export const contarDiasHabiles = (desde, hasta, diasLaboralesSemana = 6) => {
  let n = 0
  const ini = new Date(desde + 'T12:00:00')
  const fin = new Date(hasta + 'T12:00:00')
  for (let d = new Date(ini); d <= fin; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay()   // 0 = domingo
    const habil = diasLaboralesSemana >= 7 ? true
      : diasLaboralesSemana >= 6 ? dow !== 0
      : (dow >= 1 && dow <= 5)
    if (habil) n++
  }
  return n
}

export const calcularNomina = (empleado, asistencia = [], periodo = 'mensual', mes = 1, año = 2026, params = PARAMS_NOMINA_DEFAULT, rango = null, unidadesDestajo = 0) => {
  if (!empleado) return null
  const P = params || PARAMS_NOMINA_DEFAULT
  const salario = empleado.salario || P.smlmv
  const tipo = empleado.tipo_pago || 'nomina'
  const factor = periodo === 'quincenal' ? 0.5 : 1

  // Horas y días trabajados según el listado de asistencia.
  // Si se pasa un rango {desde, hasta} se filtra por ese rango; si no, por mes/año.
  const enRango = asistencia.filter(a => {
    if (!a.fecha) return false
    if (rango && rango.desde && rango.hasta) return a.fecha >= rango.desde && a.fecha <= rango.hasta
    try {
      const d = new Date(a.fecha + 'T12:00:00')
      return d.getMonth() + 1 === mes && d.getFullYear() === año
    } catch { return false }
  })
  let horas = 0, diasTrab = 0
  enRango.forEach(a => {
    const h = calcHoras(a.entrada, a.salida)
    if (h > 0) { horas += h; diasTrab++ }
  })

  // ---------- Contrato de prestación de servicios (CPS) ----------
  if (tipo === 'cps') {
    const honorarios = salario * factor
    const ibc       = honorarios * P.cps.ibc        // base de cotización (40%)
    const salud     = ibc * P.cps.salud             // 12.5%
    const pension   = ibc * P.cps.pension           // 16%
    const retencion = honorarios * (P.cps.retencion || 0)
    const neto      = honorarios - salud - pension - retencion
    return {
      tipo, esCPS: true, salario, incluyeAux: false, horas, diasTrab,
      salBase: honorarios, auxTransp: 0,
      salud, pension, retencion, ibc, neto,
      cesantias: 0, intCes: 0, prima: 0, vacaciones: 0, totalPrestaciones: 0,
      parafiscales: { salud: 0, pension: 0, arl: 0, caja: 0, icbf: 0, sena: 0, total: 0 },
      costoEmpleador: honorarios,
    }
  }

  // ---------- Destajo por hora (informal, SIN prestaciones ni parafiscales) ----------
  if (tipo === 'destajo_hora') {
    const vh = parseFloat(empleado.valor_hora) || 0
    const salBase = horas * vh
    return {
      tipo, esCPS: false, esDestajoHora: true, salario, incluyeAux: false, horas, diasTrab,
      salBase, auxTransp: 0, valorHora: vh,
      salud: 0, pension: 0, neto: salBase,
      cesantias: 0, intCes: 0, prima: 0, vacaciones: 0, totalPrestaciones: 0,
      parafiscales: { salud: 0, pension: 0, arl: 0, caja: 0, icbf: 0, sena: 0, total: 0 },
      costoEmpleador: salBase,
    }
  }

  // ---------- Contrato laboral (nómina / horas / destajo) ----------
  const incluyeAux = salario <= P.topeAuxSMLMV * P.smlmv
  let auxTransp = incluyeAux ? P.auxTransporte * factor : 0
  // Pago por horas: el auxilio se prorratea por días trabajados (no se paga completo)
  if (incluyeAux && tipo === 'horas' && P.prorrateaAuxDias) {
    auxTransp = P.auxTransporte * (diasTrab / 30)
  }

  let salBase
  if (tipo === 'horas') {
    const valorHora = salario / (P.horasMes || 230)
    salBase = horas * valorHora
  } else if (tipo === 'destajo') {
    // Destajo por producción: unidades producidas × tarifa por unidad (con prestaciones)
    salBase = (parseFloat(unidadesDestajo) || 0) * (parseFloat(empleado.tarifa_destajo) || 0)
  } else {
    salBase = salario * factor   // nómina fija
  }

  // ----- Descuentos por inasistencia (solo nómina fija; no aplica a 'horas' que ya paga lo trabajado) -----
  const jornadaDiaria = (P.horasSemana || 44) / (P.diasLaboralesSemana || 6)   // horas/día
  const valorDia  = salario / 30
  const valorHora = salario / (P.horasMes || 230)
  let diasNoLaborados = 0, horasFaltantes = 0, descuentoDias = 0, descuentoHoras = 0
  if (P.descuentaInasistencia && tipo === 'nomina') {
    if (P.modoInasistencia === 'manual') {
      // Días marcados como inasistencia injustificada en el listado
      diasNoLaborados = enRango.filter(a => a.estado_dia === 'injustificada').length
      // Horas faltantes en los días efectivamente asistidos
      if (P.descuentaHorasFaltantes) {
        enRango.filter(a => a.estado_dia !== 'injustificada' && a.estado_dia !== 'justificada')
          .forEach(a => { const h = calcHoras(a.entrada, a.salida); if (h > 0) horasFaltantes += Math.max(0, jornadaDiaria - h) })
      }
    } else {
      // Automático: días hábiles del rango (desde la vinculación) menos días asistidos
      const desdeEf = empleado.fecha_ingreso && empleado.fecha_ingreso > rango?.desde ? empleado.fecha_ingreso : rango?.desde
      const diasHabiles = desdeEf && rango?.hasta ? contarDiasHabiles(desdeEf, rango.hasta, P.diasLaboralesSemana || 6) : 0
      diasNoLaborados = Math.max(0, diasHabiles - diasTrab)
      if (P.descuentaHorasFaltantes) {
        // Déficit de jornada en los días asistidos
        horasFaltantes = Math.max(0, diasTrab * jornadaDiaria - horas)
      }
    }
    descuentoDias  = diasNoLaborados * valorDia
    descuentoHoras = horasFaltantes * valorHora
  }
  const descuentoInasistencia = descuentoDias + descuentoHoras

  // Deducciones del empleado
  const salud   = salBase * P.empleado.salud
  const pension = salBase * P.empleado.pension
  const neto    = salBase + auxTransp - salud - pension - descuentoInasistencia

  // Provisión de prestaciones
  const cesantias  = salBase * P.prestaciones.cesantias
  const intCes     = cesantias * P.prestaciones.intCesantias
  const prima      = salBase * P.prestaciones.prima
  const vacaciones = salBase * P.prestaciones.vacaciones
  const totalPrestaciones = cesantias + intCes + prima + vacaciones

  // Aportes del empleador (parafiscales) — con exoneración Ley 1607 si aplica
  const exime = P.exoneraParafiscales && salario < 10 * P.smlmv
  const paraSalud   = exime ? 0 : salBase * P.empleador.salud
  const paraPension = salBase * P.empleador.pension
  const paraArl     = salBase * P.empleador.arl
  const paraCaja    = salBase * P.empleador.caja
  const paraIcbf    = exime ? 0 : salBase * P.empleador.icbf
  const paraSena    = exime ? 0 : salBase * P.empleador.sena
  const paraTotal   = paraSalud + paraPension + paraArl + paraCaja + paraIcbf + paraSena

  const costoEmpleador = salBase + auxTransp + totalPrestaciones + paraTotal

  // Garantía de salario mínimo (destajo): lo devengado no puede ser inferior al mínimo proporcional
  // al tiempo trabajado. El SMLMV se toma de los parámetros (P.smlmv).
  const diasMin = diasTrab > 0 ? diasTrab : (periodo === 'quincenal' ? 15 : 30)
  const minimoProporcional = tipo === 'destajo' ? P.smlmv * (diasMin / 30) : 0
  const cumpleMinimo = tipo !== 'destajo' || salBase >= minimoProporcional
  const faltanteMinimo = Math.max(0, minimoProporcional - salBase)

  return {
    tipo, esCPS: false, salario, incluyeAux, horas, diasTrab,
    salBase, auxTransp, salud, pension, neto,
    unidadesDestajo: tipo === 'destajo' ? (parseFloat(unidadesDestajo) || 0) : 0,
    tarifaDestajo: tipo === 'destajo' ? (parseFloat(empleado.tarifa_destajo) || 0) : 0,
    minimoProporcional, cumpleMinimo, faltanteMinimo,
    cesantias, intCes, prima, vacaciones, totalPrestaciones,
    diasNoLaborados, horasFaltantes, descuentoDias, descuentoHoras, descuentoInasistencia,
    parafiscales: { salud: paraSalud, pension: paraPension, arl: paraArl, caja: paraCaja, icbf: paraIcbf, sena: paraSena, total: paraTotal, exime },
    costoEmpleador,
  }
}

// ==================== CALCULADORA DE RECETA ====================

// Calcula el batch completo a partir de un ingrediente ancla
// ingredientes: [{ nombre, pct, precio, tipo ('normal'|'relativo'), base }]
export const calcularReceta = ({ ingredientes = [], ancla, cantidadAncla = 0, rendimiento = 62, desperdicio = 2, pesoUnidad = 1000 }) => {
  if (!ancla || cantidadAncla <= 0 || !ingredientes.length) return null

  const anclaRow = ingredientes.find(r => r.nombre === ancla)
  if (!anclaRow || anclaRow.pct <= 0) return null

  // base de un relativo: 'total', un nombre, o varios nombres (relativo a la suma)
  const baseList = (b) => Array.isArray(b) ? b.filter(Boolean) : (b && b !== 'total' ? [b] : [])

  // Fracción del ancla sobre el total de la mezcla.
  // - Normal: su % es directamente sobre el total.
  // - Relativo: su % es sobre la suma de sus bases → fracción = (Σ fracción de bases) × (su % / 100).
  let anclaFrac
  if (anclaRow.tipo === 'relativo' && baseList(anclaRow.base).length) {
    const baseFrac = baseList(anclaRow.base).reduce((s, bn) => {
      const br = ingredientes.find(x => x.nombre === bn)
      return s + (br ? (br.pct / 100) : 0)
    }, 0)
    anclaFrac = baseFrac * (anclaRow.pct / 100)
  } else {
    anclaFrac = anclaRow.pct / 100
  }
  if (anclaFrac <= 0) return null
  // Total de mezcla calculado desde el ancla
  const totalMezcla = cantidadAncla / anclaFrac
  const calculados = ingredientes.map(r => {
    let cantidad
    const bases = r.tipo === 'relativo' ? baseList(r.base) : []
    if (bases.length) {
      const baseCant = bases.reduce((s, bn) => {
        const br = ingredientes.find(x => x.nombre === bn)
        return s + (br ? totalMezcla * (br.pct / 100) : 0)
      }, 0)
      cantidad = baseCant * (r.pct / 100)
    } else {
      cantidad = totalMezcla * (r.pct / 100)
    }
    const costoTotal = (r.precio / 1000) * cantidad
    return { ...r, cantidad, costoTotal }
  })

  const totalCostoMP = calculados.reduce((s, r) => s + r.costoTotal, 0)
  const pesoEsperado = totalMezcla * (rendimiento / 100)
  const pesoDesp     = pesoEsperado * (desperdicio / 100)
  const pesoFinal    = pesoEsperado - pesoDesp
  const unidades     = pesoUnidad > 0 ? pesoFinal / pesoUnidad : 0
  const costoMPkilo  = pesoFinal > 0 ? (totalCostoMP / pesoFinal) * 1000 : 0
  const costoMPcaja  = unidades > 0 ? totalCostoMP / unidades : 0

  return { calculados, totalMezcla, totalCostoMP, pesoEsperado, pesoDesp, pesoFinal, unidades, costoMPkilo, costoMPcaja }
}

// ==================== INVENTARIO ====================
export const getEstadoStock = (stock = 0, stockMin = 0) => {
  if (stock < 0)        return { label: 'Negativo', badge: 'badge-rojo' }
  if (stock === 0)      return { label: 'Sin stock', badge: 'badge-rojo' }
  if (stock <= stockMin) return { label: 'Stock bajo', badge: 'badge-dorado' }
  return { label: 'OK', badge: 'badge-verde' }
}
