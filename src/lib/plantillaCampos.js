// Biblioteca de CAMPOS para las plantillas de Excel de la Orden de Producción (PTZ-OR-01).
//
// El usuario diseña su plantilla en Excel y escribe marcadores {{id}} en las celdas.
// Al generar una orden, el sistema reemplaza cada marcador por su valor real.
//   · estado 'auto'   → el sistema lo llena con datos reales de la orden.
//   · estado 'blanco' → campo propio de la industria de alimentos que HOY no se captura en el
//                       sistema: se imprime en blanco para diligenciarlo a mano (y queda ya
//                       reservado el ID para cuando se capture).
//
// Los campos de TABLA (ing., proc., cal., extra.) repiten la fila que los contiene una vez por
// elemento (una por ingrediente, por proceso, etc.).

export const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g

const A = (id, label, tipo, desc, ejemplo) => ({ id, label, tipo, desc, ejemplo, estado: 'auto' })
const B = (id, label, tipo, desc, ejemplo) => ({ id, label, tipo, desc, ejemplo: ejemplo ?? '', estado: 'blanco' })

// ───────────────────────── Campos sueltos (un valor) ─────────────────────────
export const GRUPOS = [
  {
    id: 'doc', titulo: 'Documento (encabezado del formato)',
    campos: [
      A('doc.codigo', 'Código del formato', 'texto', 'Código del documento en Gestión Documental.', 'PTZ-OR-01'),
      A('doc.version', 'Versión del formato', 'texto', 'Versión vigente del documento en Gestión Documental.', '2'),
      A('doc.titulo', 'Título del formato', 'texto', 'Nombre del documento.', 'Orden de producción'),
      A('doc.fecha_emision', 'Fecha de emisión', 'fecha', 'Fecha en que se creó la orden.', '06/10/2026'),
      A('doc.fecha_impresion', 'Fecha de impresión', 'fecha', 'Fecha en que se genera el documento.', '08/10/2026'),
    ],
  },
  {
    id: 'empresa', titulo: 'Empresa',
    campos: [
      A('empresa.nombre', 'Nombre de la empresa', 'texto', 'Configurado en Configuración.', 'Mumi Amazonia'),
      A('empresa.nit', 'NIT', 'texto', 'NIT de la empresa.', '900.123.456-7'),
      A('empresa.direccion', 'Dirección', 'texto', 'Dirección de la planta/empresa.', 'Vereda El Retiro'),
      A('empresa.ciudad', 'Ciudad', 'texto', 'Ciudad.', 'San José del Guaviare'),
      A('empresa.telefono', 'Teléfono', 'texto', 'Teléfono de contacto.', '3001234567'),
      A('empresa.logo', 'Logo de la empresa', 'imagen', 'Imagen: escríbelo en una celda (combinada) y el logo se ajusta a su tamaño.', ''),
      B('empresa.registro_sanitario', 'Registro/permiso sanitario de la planta', 'texto', 'Número de registro o concepto sanitario de la planta.'),
      B('empresa.representante', 'Representante legal', 'texto', 'Nombre del representante legal.'),
    ],
  },
  {
    id: 'orden', titulo: 'Orden de producción',
    campos: [
      A('orden.numero', 'Número de la orden', 'texto', 'Número consecutivo con prefijo.', 'OP-0012'),
      A('orden.estado', 'Estado de la orden', 'texto', 'Estado actual (pendiente, en proceso, ejecutada, aprobada…).', 'aprobada'),
      A('orden.tipo', 'Tipo de orden', 'texto', 'Producto terminado, subproducto interno o prueba.', 'Producto terminado'),
      A('orden.es_prueba', 'Marca de orden de prueba', 'texto', 'Imprime «★ ORDEN DE PRUEBA — NO COMERCIALIZAR ★» solo si es de prueba; si no, queda vacío.', ''),
      A('orden.notas', 'Notas de la orden', 'texto', 'Notas escritas al crear la orden.', 'Usar fruta de la cosecha del lunes'),
      B('orden.turno', 'Turno', 'texto', 'Turno de trabajo (mañana, tarde, noche).'),
      B('orden.linea', 'Línea / área de producción', 'texto', 'Línea o área donde se produce.'),
      B('orden.cliente', 'Cliente / pedido asociado', 'texto', 'Cliente o número de pedido que origina la orden.'),
      B('orden.prioridad', 'Prioridad', 'texto', 'Normal, urgente…'),
      B('orden.autorizada_por', 'Orden autorizada por', 'texto', 'Quien autoriza la orden.'),
    ],
  },
  {
    id: 'producto', titulo: 'Producto',
    campos: [
      A('producto.nombre', 'Nombre del producto', 'texto', 'Nombre comercial.', 'Bocadillo de guayaba'),
      A('producto.imagen', 'Imagen del producto', 'imagen', 'Imagen principal de la ficha del producto (celda combinada).', ''),
      A('producto.presentacion_g', 'Presentación (peso de la unidad)', 'texto', 'Peso de la unidad en gramos.', '40 gr'),
      A('producto.unidad', 'Unidad de la orden', 'texto', 'Unidad en que se cuenta la orden (presentación de la ficha).', 'Bolsa'),
      B('producto.codigo_interno', 'Código interno del producto', 'texto', 'Código/SKU interno.'),
      B('producto.codigo_barras', 'Código de barras (EAN/GTIN)', 'texto', 'Código de barras.'),
      B('producto.registro_invima', 'Registro / notificación sanitaria INVIMA', 'texto', 'Número de registro sanitario del producto.'),
      B('producto.vida_util', 'Vida útil', 'texto', 'Tiempo de vida útil declarado.'),
      B('producto.condiciones_conservacion', 'Condiciones de conservación', 'texto', 'Ej.: «Conservar en lugar fresco y seco».'),
      B('producto.alergenos', 'Alérgenos declarados', 'texto', 'Alérgenos del producto o trazas.'),
      B('producto.version_receta', 'Versión de la receta/fórmula', 'texto', 'Versión de la fórmula usada.'),
    ],
  },
  {
    id: 'lote', titulo: 'Lote y fechas',
    campos: [
      A('lote.numero', 'Lote', 'texto', 'Número de lote del producto.', '10126'),
      A('lote.fecha_fabricacion', 'Fecha de fabricación', 'fecha', 'Fecha de inicio de fabricación.', '06/10/2026'),
      A('lote.fecha_vencimiento', 'Fecha de vencimiento', 'fecha', 'Fecha de vencimiento (dd/mm/aaaa).', '06/10/2027'),
      A('lote.vence_ddmmaa', 'Vencimiento (ddmmaa)', 'texto', 'Vencimiento en formato compacto del rótulo.', '061027'),
      A('lote.mezcla', 'Lote(s) del empaque surtido', 'texto', 'Lotes combinados cuando se empaca surtido.', '10026, 10126'),
      B('lote.fecha_envasado', 'Fecha de envasado', 'fecha', 'Si difiere de la de fabricación.'),
      B('lote.cuarentena_hasta', 'Cuarentena hasta', 'fecha', 'Fecha hasta la que el lote está retenido.'),
    ],
  },
  {
    id: 'cantidad', titulo: 'Cantidades y rendimiento',
    campos: [
      A('cantidad.planificada', 'Cantidad a producir (número)', 'numero', 'Solo el número planificado.', '500'),
      A('cantidad.planificada_unidad', 'Cantidad a producir (con unidad)', 'texto', 'Número + unidad/presentación.', '500 Bolsa'),
      A('cantidad.producida', 'Cantidad producida (con unidad)', 'texto', 'Lo realmente obtenido.', '480 Bolsa'),
      A('cantidad.empaque_utilizado', 'Empaque utilizado', 'texto', 'Empaques consumidos (bolsas, cajas…).', '480 Bolsa 40g · 20 Caja x24'),
      A('cantidad.peso_obtenido', 'Peso obtenido (g)', 'texto', 'Peso real obtenido (lo diligencia el operario).', '19.200 g'),
      A('cantidad.desperdicio', 'Desperdicio (g)', 'texto', 'Desperdicio real.', '350 g'),
      A('cantidad.mezcla_total', 'Mezcla total prevista (g)', 'texto', 'Mezcla total calculada de la receta.', '25.000 g'),
      A('cantidad.peso_esperado', 'Peso esperado (g)', 'texto', 'Peso esperado según rendimiento de la ficha.', '19.500 g'),
      A('cantidad.unidades_estimadas', 'Unidades estimadas', 'texto', 'Unidades estimadas por la receta.', '487,5'),
      A('cantidad.peso_subporcion', 'Peso de la subporción', 'texto', 'Solo productos porcionados.', '10 g'),
      A('cantidad.cant_subporciones', 'Cantidad de subporciones', 'texto', 'Solo productos porcionados.', '1.920'),
      A('cantidad.surtido', 'Cantidad empacada en surtido', 'texto', 'Cajas/unidades de surtido.', '40'),
      A('cantidad.sobrante', 'Sobrante sin empacar', 'texto', 'Cantidad que quedó sin empacar.', '1,5 kg'),
      B('cantidad.rendimiento_pct', 'Rendimiento real (%)', 'numero', 'Peso obtenido / mezcla total.'),
      B('cantidad.merma_pct', 'Merma (%)', 'numero', 'Pérdida del proceso.'),
      B('cantidad.cajas', 'Cajas / estibas resultantes', 'numero', 'Número de cajas empacadas.'),
      B('cantidad.reproceso', 'Cantidad enviada a reproceso', 'texto', 'Producto no conforme enviado a reproceso.'),
    ],
  },
  {
    id: 'personal', titulo: 'Personal y responsables',
    campos: [
      A('personal.operario', 'Operario responsable', 'texto', 'Operario asignado a la orden.', 'María Pérez'),
      B('personal.supervisor', 'Supervisor de producción', 'texto', 'Quien supervisa la producción.'),
      B('personal.auxiliar', 'Auxiliar / ayudante', 'texto', 'Personal de apoyo.'),
      B('personal.control_calidad', 'Responsable de calidad', 'texto', 'Quien verifica calidad.'),
      B('personal.jefe_produccion', 'Jefe de producción', 'texto', 'Jefe de planta.'),
      B('personal.liberado_por', 'Producto liberado por', 'texto', 'Quien libera el lote.'),
      B('personal.fecha_capacitacion', 'Fecha de última capacitación BPM', 'fecha', 'Fecha de capacitación vigente del operario.'),
    ],
  },
  {
    id: 'tiempo', titulo: 'Tiempos',
    campos: [
      A('tiempo.fecha_inicio', 'Fecha de inicio', 'fecha', 'Fecha de inicio de fabricación.', '06/10/2026'),
      A('tiempo.hora_inicio', 'Hora de inicio', 'texto', 'Hora de inicio (modo básico).', '07:30'),
      A('tiempo.hora_fin', 'Hora de finalización', 'texto', 'Hora de fin (modo básico).', '11:45'),
      B('tiempo.duracion', 'Duración total', 'texto', 'Tiempo total del proceso.'),
      B('tiempo.coccion', 'Tiempo de cocción', 'texto', 'Tiempo de cocción/concentración.'),
      B('tiempo.enfriamiento', 'Tiempo de enfriamiento', 'texto', 'Tiempo de enfriamiento.'),
      B('tiempo.reposo', 'Tiempo de reposo', 'texto', 'Tiempo de reposo/maduración.'),
    ],
  },
  {
    id: 'check', titulo: 'Verificaciones SÍ / NO',
    desc: 'Cada verificación genera 3 marcadores: {{id}} → «SI»/«NO»; {{id.si}} → «X» si es SÍ; {{id.no}} → «X» si es NO. Úsalos dentro de casillas con borde.',
    campos: [
      A('check.conforme', '¿Producto conforme?', 'sino', 'Resultado de conformidad que marca el operario.', 'SI'),
      A('check.empaco_surtido', '¿Empacó surtido?', 'sino', 'Si se empacó en surtido.', 'NO'),
      A('check.hay_sobrante', '¿Quedó sin empacar?', 'sino', 'Si quedó producto sin empacar.', 'SI'),
      B('check.despeje_linea', '¿Despeje de línea realizado?', 'sino', 'Línea libre de producto/material anterior.'),
      B('check.equipos_limpios', '¿Equipos limpios y desinfectados?', 'sino', 'Verificación previa al inicio.'),
      B('check.personal_dotacion', '¿Personal con dotación completa?', 'sino', 'Uniforme, cofia, tapabocas, guantes.'),
      B('check.mp_verificada', '¿MP verificada (lote, vencimiento, aspecto)?', 'sino', 'Revisión de materias primas.'),
      B('check.balanzas_calibradas', '¿Balanzas/instrumentos calibrados?', 'sino', 'Calibración vigente.'),
      B('check.detector_metales', '¿Pasó detector de metales?', 'sino', 'Control de cuerpos extraños metálicos.'),
      B('check.sellado_ok', '¿Sellado/hermeticidad conforme?', 'sino', 'Verificación del sellado.'),
      B('check.etiqueta_ok', '¿Etiqueta/rótulo conforme?', 'sino', 'Lote y vencimiento legibles y correctos.'),
      B('check.muestra_retencion', '¿Se tomó muestra de retención?', 'sino', 'Contramuestra del lote.'),
      B('check.liberado', '¿Lote liberado?', 'sino', 'Liberación para despacho.'),
    ],
  },
  {
    id: 'calidad', titulo: 'Calidad y control en proceso',
    campos: [
      B('calidad.color', 'Color', 'texto', 'Característica organoléptica: color.'),
      B('calidad.olor', 'Olor', 'texto', 'Característica organoléptica: olor.'),
      B('calidad.sabor', 'Sabor', 'texto', 'Característica organoléptica: sabor.'),
      B('calidad.textura', 'Textura / consistencia', 'texto', 'Característica organoléptica: textura.'),
      B('calidad.apariencia', 'Apariencia general', 'texto', 'Aspecto del producto terminado.'),
      B('calidad.brix', '°Brix', 'numero', 'Sólidos solubles.'),
      B('calidad.ph', 'pH', 'numero', 'Acidez medida.'),
      B('calidad.aw', 'Actividad de agua (aw)', 'numero', 'Actividad de agua.'),
      B('calidad.humedad', 'Humedad (%)', 'numero', 'Humedad del producto.'),
      B('calidad.acidez', 'Acidez titulable (%)', 'numero', 'Acidez titulable.'),
      B('calidad.temp_proceso', 'Temperatura de proceso (°C)', 'numero', 'Temperatura de cocción/pasteurización.'),
      B('calidad.temp_envasado', 'Temperatura de envasado (°C)', 'numero', 'Envasado en caliente, por ejemplo.'),
      B('calidad.temp_producto_final', 'Temperatura del producto final (°C)', 'numero', 'Temperatura al terminar.'),
      B('calidad.peso_neto_muestra', 'Peso neto de muestra (g)', 'numero', 'Verificación de peso neto.'),
      B('calidad.sellado', 'Estado del sellado', 'texto', 'Descripción del sellado.'),
      B('calidad.cuerpos_extranos', 'Cuerpos extraños', 'texto', 'Hallazgos de cuerpos extraños.'),
      B('calidad.resultado', 'Resultado de calidad', 'texto', 'Conforme / No conforme.'),
      B('calidad.analista', 'Analista que verifica', 'texto', 'Persona que realiza los controles.'),
      B('calidad.observaciones', 'Observaciones de calidad', 'texto', 'Notas del control de calidad.'),
    ],
  },
  {
    id: 'ambiente', titulo: 'Condiciones ambientales',
    campos: [
      B('ambiente.temperatura', 'Temperatura del área (°C)', 'numero', 'Temperatura ambiente del área de proceso.'),
      B('ambiente.humedad_relativa', 'Humedad relativa (%)', 'numero', 'Humedad relativa del área.'),
      B('ambiente.temp_cuarto_frio', 'Temperatura cuarto frío (°C)', 'numero', 'Almacenamiento refrigerado.'),
      B('ambiente.presion_diferencial', 'Presión diferencial', 'texto', 'Zonas con presión controlada.'),
    ],
  },
  {
    id: 'equipo', titulo: 'Equipos e instrumentos',
    campos: [
      B('equipo.principal', 'Equipo principal usado', 'texto', 'Marmita, mezcladora, horno…'),
      B('equipo.codigo', 'Código del equipo', 'texto', 'Código/serial interno.'),
      B('equipo.balanza', 'Balanza utilizada', 'texto', 'Código de la balanza.'),
      B('equipo.termometro', 'Termómetro utilizado', 'texto', 'Código del termómetro.'),
      B('equipo.refractometro', 'Refractómetro utilizado', 'texto', 'Código del refractómetro.'),
      B('equipo.phmetro', 'pH-metro utilizado', 'texto', 'Código del pH-metro.'),
      B('equipo.calibracion_vigente', 'Calibración vigente hasta', 'fecha', 'Fecha de vencimiento de la calibración.'),
      B('equipo.mantenimiento', 'Último mantenimiento', 'fecha', 'Fecha del último mantenimiento.'),
    ],
  },
  {
    id: 'limpieza', titulo: 'Limpieza y desinfección',
    campos: [
      B('limpieza.ultima_fecha', 'Fecha de la última limpieza', 'fecha', 'Última limpieza del área/equipo.'),
      B('limpieza.responsable', 'Responsable de la limpieza', 'texto', 'Quien limpió.'),
      B('limpieza.desinfectante', 'Desinfectante utilizado', 'texto', 'Producto y concentración.'),
      B('limpieza.verificada_por', 'Limpieza verificada por', 'texto', 'Quien verifica la limpieza.'),
    ],
  },
  {
    id: 'empaque', titulo: 'Empaque y embalaje',
    campos: [
      B('empaque.tipo', 'Tipo de empaque', 'texto', 'Bolsa, frasco, caja…'),
      B('empaque.lote_envase', 'Lote del envase/empaque primario', 'texto', 'Lote del proveedor de empaque.'),
      B('empaque.lote_caja', 'Lote de la caja', 'texto', 'Lote del embalaje.'),
      B('empaque.lote_etiqueta', 'Lote de etiqueta', 'texto', 'Lote de etiquetas.'),
      B('empaque.unidades_por_caja', 'Unidades por caja', 'numero', 'Unidades por caja.'),
      B('empaque.peso_bruto_caja', 'Peso bruto por caja (kg)', 'numero', 'Peso de la caja llena.'),
      B('empaque.atmosfera', 'Atmósfera / vacío', 'texto', 'Vacío, atmósfera modificada…'),
    ],
  },
  {
    id: 'rotulo', titulo: 'Rotulado',
    campos: [
      A('rotulo.lote', 'Lote del rótulo', 'texto', 'Lote que va impreso (Lot.).', '10126'),
      A('rotulo.vence', 'Vencimiento del rótulo (ddmmaa)', 'texto', 'Vencimiento que va impreso (Exp.).', '061027'),
      B('rotulo.ingredientes', 'Lista de ingredientes declarada', 'texto', 'Orden de ingredientes del rótulo.'),
      B('rotulo.pais_origen', 'País de origen', 'texto', 'País de origen.'),
      B('rotulo.contenido_neto', 'Contenido neto declarado', 'texto', 'Peso/volumen declarado.'),
      B('rotulo.tabla_nutricional', 'Tabla nutricional verificada', 'texto', 'Verificación de tabla nutricional.'),
    ],
  },
  {
    id: 'traza', titulo: 'Trazabilidad (resumen)',
    campos: [
      A('traza.lotes_mp', 'Lotes de materias primas usados', 'texto', 'Todos los lotes de MP consumidos, separados por coma.', '1024, 1031, 0987'),
      A('traza.proveedores', 'Proveedores de las MP', 'texto', 'Proveedores de las MP usadas.', 'Frutas del Guaviare'),
      B('traza.destino', 'Destino del producto', 'texto', 'Cliente/bodega a la que se despacha el lote.'),
      B('traza.factura_remision', 'Factura / remisión', 'texto', 'Documento de despacho.'),
    ],
  },
  {
    id: 'nc', titulo: 'No conformidades y acciones',
    campos: [
      B('nc.descripcion', 'Descripción de la no conformidad', 'texto', 'Qué ocurrió.'),
      B('nc.causa', 'Causa probable', 'texto', 'Causa raíz.'),
      B('nc.accion_correctiva', 'Acción correctiva', 'texto', 'Acción inmediata/correctiva.'),
      B('nc.disposicion', 'Disposición del producto', 'texto', 'Reproceso, destrucción, aprobado con concesión…'),
      B('nc.responsable', 'Responsable de la acción', 'texto', 'Quien ejecuta la acción.'),
      B('nc.numero_acpm', 'N° de ACPM asociado', 'texto', 'Número de acción correctiva/preventiva.'),
    ],
  },
  {
    id: 'liberacion', titulo: 'Liberación del lote',
    campos: [
      B('liberacion.estado', 'Estado del lote', 'texto', 'Liberado / en cuarentena / rechazado.'),
      B('liberacion.fecha', 'Fecha de liberación', 'fecha', 'Fecha de liberación.'),
      B('liberacion.aprobado_por', 'Aprobado por', 'texto', 'Quien aprueba la liberación.'),
      B('liberacion.analisis_micro', 'Ref. de análisis microbiológico', 'texto', 'N° de informe de laboratorio.'),
    ],
  },
  {
    id: 'costo', titulo: 'Costos',
    campos: [
      B('costo.total', 'Costo total de la orden', 'numero', 'Costo total.'),
      B('costo.unitario', 'Costo por unidad', 'numero', 'Costo unitario.'),
    ],
  },
  {
    id: 'obs', titulo: 'Observaciones',
    campos: [
      A('obs.notas', 'Observaciones / notas de la orden', 'texto', 'Notas de la orden.', 'Sin novedades'),
      A('obs.resultado', 'Observaciones del resultado', 'texto', 'Comentarios que deja el operario al reportar resultados.', 'Lote conforme'),
      B('obs.supervisor', 'Observaciones del supervisor', 'texto', 'Notas del supervisor.'),
    ],
  },
]

// ───────────────────────── Campos de TABLA (repiten fila) ─────────────────────────
export const LISTAS = [
  {
    prefijo: 'ing', titulo: 'Ingredientes y trazabilidad de MP',
    desc: 'Una fila por ingrediente (y por empaque consumido). Si una MP tiene varios lotes, aparecen uno por línea dentro de la celda.',
    campos: [
      A('ing.n', 'N° de fila', 'numero', '1, 2, 3…', '1'),
      A('ing.nombre', 'Ingrediente', 'texto', 'Nombre de la materia prima.', 'Pulpa de guayaba'),
      A('ing.lote', 'Lote de la MP', 'texto', 'Lote(s) usados.', '1024'),
      A('ing.vence', 'Vencimiento del lote', 'texto', 'Vencimiento del lote usado.', '12/03/2027'),
      A('ing.proveedor', 'Proveedor', 'texto', 'Proveedor del lote.', 'Frutas del Guaviare'),
      A('ing.trazabilidad', 'Trazabilidad completa', 'texto', 'Lote + vence + proveedor en un solo campo.', 'Lote: 1024 / Vence: 12/03/2027 / Proveedor: …'),
      A('ing.porcentaje', 'Porcentaje', 'texto', 'Porcentaje en la mezcla.', '45,50%'),
      A('ing.cantidad_g', 'Cantidad (g)', 'texto', 'Cantidad del ingrediente en gramos.', '11.375'),
    ],
  },
  {
    prefijo: 'proc', titulo: 'Tiempos por proceso / subproceso',
    desc: 'Una fila por proceso registrado en modo avanzado.',
    campos: [
      A('proc.n', 'N° de fila', 'numero', '1, 2, 3…', '1'),
      A('proc.nombre', 'Proceso', 'texto', 'Nombre del proceso o subproceso.', 'Cocción'),
      A('proc.fecha', 'Fecha', 'fecha', 'Fecha del proceso.', '06/10/2026'),
      A('proc.inicio', 'Hora de inicio', 'texto', 'Inicio del proceso.', '07:30'),
      A('proc.fin', 'Hora de fin', 'texto', 'Fin del proceso.', '09:10'),
    ],
  },
  {
    prefijo: 'cal', titulo: 'Parámetros de calidad (de la ficha)',
    desc: 'Una fila por parámetro de calidad definido en la ficha del producto.',
    campos: [
      A('cal.n', 'N° de fila', 'numero', '1, 2, 3…', '1'),
      A('cal.nombre', 'Parámetro', 'texto', 'Nombre del parámetro.', '°Brix'),
      A('cal.esperado', 'Especificación', 'texto', 'Valor esperado de la ficha.', '65-68'),
      A('cal.obtenido', 'Valor obtenido', 'texto', 'Lo medido por el operario.', '66'),
      A('cal.cumple', '¿Cumple?', 'texto', '«Cumple ✓», «No cumple ✗» o vacío.', 'Cumple ✓'),
    ],
  },
  {
    prefijo: 'extra', titulo: 'Datos adicionales del producto',
    desc: 'Una fila por dato adicional de la ficha (productor, finca, registro…).',
    campos: [
      A('extra.nombre', 'Nombre del dato', 'texto', 'Etiqueta del dato adicional.', 'Finca'),
      A('extra.valor', 'Valor del dato', 'texto', 'Valor del dato adicional.', 'La Esperanza'),
    ],
  },
]

// ───────────────────────── Índices y utilidades ─────────────────────────
// Los campos «sino» generan además .si y .no
const expandirSino = (campos) => campos.flatMap(c => c.tipo === 'sino'
  ? [c,
     { ...c, id: c.id + '.si', label: c.label + ' — casilla SÍ', tipo: 'casilla', desc: 'Escribe «X» si la respuesta es SÍ (úsalo en una casilla con borde).', ejemplo: c.ejemplo === 'SI' ? 'X' : '' },
     { ...c, id: c.id + '.no', label: c.label + ' — casilla NO', tipo: 'casilla', desc: 'Escribe «X» si la respuesta es NO (úsalo en una casilla con borde).', ejemplo: c.ejemplo === 'NO' ? 'X' : '' }]
  : [c])

export const GRUPOS_EXPANDIDOS = GRUPOS.map(g => ({ ...g, campos: expandirSino(g.campos) }))
export const CAMPOS = GRUPOS_EXPANDIDOS.flatMap(g => g.campos.map(c => ({ ...c, grupo: g.titulo })))
export const CAMPOS_LISTA = LISTAS.flatMap(l => l.campos.map(c => ({ ...c, grupo: l.titulo, lista: l.prefijo })))
export const TODOS_LOS_CAMPOS = [...CAMPOS, ...CAMPOS_LISTA]

export const CAMPO_POR_ID = Object.fromEntries(TODOS_LOS_CAMPOS.map(c => [c.id, c]))
export const PREFIJOS_LISTA = new Set(LISTAS.map(l => l.prefijo))
export const IDS_SINO = new Set(GRUPOS.flatMap(g => g.campos).filter(c => c.tipo === 'sino').map(c => c.id))
export const IDS_IMAGEN = new Set(TODOS_LOS_CAMPOS.filter(c => c.tipo === 'imagen').map(c => c.id))

export const normalizarId = (id) => String(id || '').trim().toLowerCase()
export const esCampoConocido = (id) => !!CAMPO_POR_ID[normalizarId(id)]
export const prefijoLista = (id) => { const p = normalizarId(id).split('.')[0]; return PREFIJOS_LISTA.has(p) ? p : null }

// Datos de ejemplo (vista previa al cargar una plantilla)
export function datosEjemplo() {
  const v = {}, sino = {}
  for (const c of CAMPOS) {
    if (c.estado !== 'auto' || c.tipo === 'imagen') continue
    if (c.tipo === 'sino') { sino[c.id] = c.ejemplo === 'SI' ? true : c.ejemplo === 'NO' ? false : null; continue }
    if (c.tipo === 'casilla') continue
    v[c.id] = c.ejemplo
  }
  const listas = {
    ing: [
      { n: 1, nombre: 'Pulpa de guayaba', lote: '1024', vence: '12/03/2027', proveedor: 'Frutas del Guaviare', trazabilidad: 'Lote: 1024\nVence: 12/03/2027\nProveedor: Frutas del Guaviare', porcentaje: '45,50%', cantidad_g: '11.375' },
      { n: 2, nombre: 'Azúcar', lote: 'AZ-77', vence: '01/09/2027', proveedor: 'Distribuidora Andina', trazabilidad: 'Lote: AZ-77\nVence: 01/09/2027\nProveedor: Distribuidora Andina', porcentaje: '54,00%', cantidad_g: '13.500' },
      { n: 3, nombre: 'Pectina', lote: 'PC-12', vence: '15/05/2028', proveedor: 'Insumos Bogotá', trazabilidad: 'Lote: PC-12\nVence: 15/05/2028\nProveedor: Insumos Bogotá', porcentaje: '0,50%', cantidad_g: '125' },
    ],
    proc: [
      { n: 1, nombre: 'Cocción', fecha: '06/10/2026', inicio: '07:30', fin: '09:10' },
      { n: 2, nombre: 'Envasado', fecha: '06/10/2026', inicio: '09:30', fin: '11:45' },
    ],
    cal: [
      { n: 1, nombre: '°Brix', esperado: '65-68', obtenido: '66', cumple: 'Cumple ✓' },
      { n: 2, nombre: 'pH', esperado: '3,2-3,6', obtenido: '3,4', cumple: 'Cumple ✓' },
    ],
    extra: [{ nombre: 'Finca', valor: 'La Esperanza' }, { nombre: 'Productor', valor: 'Asoc. Guaviare' }],
  }
  return { v, sino, listas, imagenes: {} }
}

// ───────────────────────── Instructivo ─────────────────────────
export const INSTRUCTIVO = [
  {
    titulo: '1. ¿Cómo funciona?',
    items: [
      'Tú diseñas la plantilla en Excel con total libertad (colores, logos, celdas combinadas, bordes, tipos de letra).',
      'Donde quieras que aparezca un dato escribe su marcador entre dobles llaves, por ejemplo {{lote.numero}} o {{producto.nombre}}.',
      'Al generar una orden, el sistema reemplaza cada marcador por el dato real y respeta tu diseño.',
      'La plantilla que publiques se guarda en Gestión Documental como el formato PTZ-OR-01 (Trazabilidad). Es la plantilla OFICIAL: todas las órdenes (PDF, impresión y descargas) la usan.',
    ],
  },
  {
    titulo: '2. Paso a paso para personalizar',
    items: [
      'En Órdenes de Producción abre «Opciones» → «Descargar plantilla» → «Excel editable». Se descarga la plantilla actual con los marcadores ya puestos.',
      'Ábrela en Excel y cambia lo que quieras: mueve, agrega o quita celdas, cambia colores, inserta tu logo (como imagen normal de Excel).',
      'Consulta «Biblioteca de campos» para ver todos los marcadores disponibles y cópialos con un clic.',
      'Guarda el archivo como .xlsx y súbelo con «Opciones» → «Cargar plantilla (Excel)». Verás una vista previa con datos de ejemplo y un aviso de cualquier marcador mal escrito.',
      'Si todo se ve bien, pulsa «Publicar como plantilla oficial». Desde ese momento las nuevas descargas e impresiones usan tu diseño.',
      'También puedes reemplazar el archivo directamente desde Gestión Documental → Trazabilidad → PTZ-OR-01: queda igualmente como plantilla oficial.',
    ],
  },
  {
    titulo: '3. Reglas de los marcadores',
    items: [
      'Se escriben así: {{id}} — dos llaves al abrir y dos al cerrar, sin espacios dentro del ID (se permiten, pero evítalos).',
      'No importan las mayúsculas: {{LOTE.NUMERO}} funciona igual que {{lote.numero}}.',
      'Puedes mezclar texto y marcadores en la misma celda: «Lote: {{lote.numero}} — vence {{lote.fecha_vencimiento}}».',
      'Si escribes un ID que no existe, esa parte se imprime en blanco y la pantalla de carga te avisa cuál es.',
      'Los campos marcados «Queda en blanco» de la biblioteca (por ejemplo {{calidad.ph}}) aún no se capturan en el sistema: se imprimen vacíos para escribirlos a mano. Ya tienen su ID reservado.',
    ],
  },
  {
    titulo: '4. Tablas que crecen (ingredientes, procesos, calidad)',
    items: [
      'Los marcadores de tabla empiezan con ing., proc., cal. o extra. (por ejemplo {{ing.nombre}}).',
      'Pon todos los marcadores de la tabla en UNA sola fila (la fila modelo). El sistema repite esa fila una vez por cada ingrediente/proceso/parámetro y empuja hacia abajo lo que haya debajo.',
      'No mezcles en la misma fila marcadores de dos tablas distintas (ing. y proc.). Si no hay datos, la fila queda en blanco para escribir a mano.',
      'Puedes combinar celdas dentro de la fila modelo (por ejemplo el nombre ocupando dos columnas): se replica en cada fila.',
      '{{ing.n}} numera las filas 1, 2, 3…',
    ],
  },
  {
    titulo: '5. Casillas SÍ / NO',
    items: [
      'Para cada verificación SÍ/NO existen tres marcadores: {{check.conforme}} escribe «SI» o «NO»; {{check.conforme.si}} escribe «X» si la respuesta es SÍ; {{check.conforme.no}} escribe «X» si es NO.',
      'Para el clásico «SI ☐  NO ☐»: escribe SI en una celda, pon {{check.conforme.si}} en la celda siguiente con borde, y repite para NO.',
    ],
  },
  {
    titulo: '6. Imágenes',
    items: [
      'Logo: escribe {{empresa.logo}} en una celda (idealmente combinada) y se coloca el logo de la empresa ajustado a esa celda.',
      'Imagen del producto: {{producto.imagen}}, igual que el logo.',
      'También puedes insertar tus propias imágenes fijas en Excel (Insertar → Imagen): se respetan tal cual.',
    ],
  },
  {
    titulo: '7. Recomendaciones de diseño',
    items: [
      'La orden se imprime en hoja carta vertical, ajustada a UNA hoja. Diseña pensando en vertical y en un ancho moderado (6 a 10 columnas).',
      'Activa «Ajustar texto» en las celdas con datos largos (nombres, observaciones). Las celdas con marcadores ya se ajustan solas.',
      'Deja alto de fila suficiente en Observaciones.',
      'Solo se usa la primera hoja visible. Las hojas cuyo nombre empieza por guion bajo (_INSTRUCTIVO, _BIBLIOTECA) se ignoran: puedes dejarlas o borrarlas.',
      'Evita fórmulas y macros: usa valores y marcadores. Guarda como .xlsx (no .xlsm ni .xls).',
    ],
  },
  {
    titulo: '8. Problemas frecuentes',
    items: [
      'Un dato sale en blanco → revisa que el ID esté bien escrito (la pantalla de carga lista los desconocidos) o que el campo sea de los que «Quedan en blanco».',
      'La orden sigue con el diseño anterior → la plantilla no tiene ningún marcador válido o el archivo no es .xlsx; vuelve a cargarla.',
      'Texto cortado → activa «Ajustar texto» o aumenta el alto de la fila.',
      'Para volver al diseño original: «Opciones» → «Descargar plantilla» → «Excel base original» y súbelo como plantilla oficial.',
    ],
  },
]
