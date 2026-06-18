# 📚 MANUALES.md — Catálogo del Sistema Documental MUMI Amazonia

> Información estructurada de la carpeta `docs/` para integrarla al sistema (módulo de **Documentos / Gestión Documental**).
> Generado el 2026-06-12. Base: `mumi-react/docs/`.

## Convención de nomenclatura (tipos de documento)

| Prefijo / sufijo | Tipo | Descripción |
|---|---|---|
| `M-` | Manual | Documento maestro (ej. Manual BPM) |
| `P-` | Programa | Plan de gestión de un proceso (ej. Limpieza, Plagas) |
| `PR-` | Procedimiento | Procedimiento documentado |
| `PT-` | Protocolo | Protocolo específico (ej. Liberación de producto) |
| `RG` | Registro | Formato diligenciable de evidencia |
| `FM` / `FTP` | Formato | Plantilla/formato |
| `CR` | Cronograma | Programación de actividades |
| `LI` | Listado | Listado maestro |
| `MZ` | Matriz | Matriz de seguimiento/análisis |
| `SP` | Solicitud | Solicitud (ej. despacho) |
| `OR` | Orden | Orden (ej. producción) |
| `POES` | POES | Procedimiento Operativo Estandarizado de Saneamiento |
| `POS` | POS | Procedimiento Operativo de Saneamiento |

**Categorías sugeridas para el sistema:** `manual`, `programa`, `procedimiento`, `protocolo`, `registro`, `formato`, `cronograma`, `listado`, `matriz`, `poes`, `pos`, `ficha_tecnica`, `ambiental`.

---

## 1. Manual BPM

| Código | Documento | Tipo | Formato | Ruta |
|---|---|---|---|---|
| M-BPM-01 | Manual BPM MUMI | manual | .docx | `docs/MANUAL BPM/M-BPM-01 MANULA BPM MUNI.docx` |

---

## 2. Programa de Limpieza y Desinfección — `P-L&D-02`

**Documento maestro:** `P-L&D-02 PROGRAMA DE LIMPIEZA Y DESINFECCION.docx`

### Cronogramas y registros
| Código | Documento | Tipo | Formato |
|---|---|---|---|
| L&D-CR-01 | Cronograma POES | cronograma | .xlsx |
| L&D-CR-02 | Cronograma POS | cronograma | .xlsx |
| L&D-CR-03 | Cronograma rotación detergentes y desinfectantes | cronograma | .xlsx |
| L&D-RG-01 | Registro de actividades | registro | .xlsx |
| L&D-RG-02 | Resultados análisis fisicoquímicos | registro | .xlsx |
| L&D-RG-03 | Resultados análisis microbiológicos | registro | .xlsx |

### POES (saneamiento de equipos/superficies en contacto)
| Código | Documento |
|---|---|
| L&D-POES-1 | Balanzas |
| L&D-POES-2 | Báscula de piso |
| L&D-POES-3 | Canecas |
| L&D-POES-4 | Estibas |
| L&D-POES-5 | Canecas |
| L&D-POES-6 | Lavamanos |
| L&D-POES-7 | Mesas de trabajo |
| L&D-POES-8 | Mezcladora |
| L&D-POES-9 | Pisos y drenajes |
| L&D-POES-10 | Tanque de agua |
| L&D-POES-11 | Utensilios |

### POS (saneamiento de superficies no en contacto)
| Código | Documento |
|---|---|
| L&D-POS-1 | Mesas y escritorios |
| L&D-POS-2 | Lámparas |
| L&D-POS-3 | Ventanas |
| L&D-POS-4 | Puertas |

---

## 3. Programa de Control de Agua Potable — `P-CAP-03`

**Documento maestro:** `P-CAP-03 PROGRAMA DE AGUA POTABLE.docx`

| Código | Documento | Tipo | Formato |
|---|---|---|---|
| CAP-RG-01 | Control cloro y pH | registro | .xlsx |
| CAP-RG-02 | Lavado de tanque | registro | .xlsx |
| — | Ficha técnica fotómetro cloro libre | ficha_tecnica | .pdf |
| — | Ficha técnica pHmetro | ficha_tecnica | .pdf |

---

## 4. Programa de Muestreo — `P-MTO-04`

**Documento maestro:** `P-MTO-04 PROGRAMA DE MUESTREO.docx`

| Código | Documento | Tipo | Formato |
|---|---|---|---|
| MTO-CR-01 | Cronogramas | cronograma | .xlsx |

---

## 5. Programa de Control de Plagas — `P-CDP-05`

**Documento maestro:** `CAL-PG-02 PROGRAMA CONTROL PLAGAS.doc`

| Código | Documento | Tipo | Formato |
|---|---|---|---|
| CDP-CR-01 | Cronograma fumigaciones | cronograma | .xlsx |
| CDP-RG-02 | Control avistamiento de plagas | registro | .xlsx |
| CDP-RG-03 | Registro de fumigación | registro | .xlsx |

---

## 6. Programa de Residuos Sólidos y Líquidos — `P-RSL-06`

**Documento maestro:** `CAL-PG-06 PROGRAMA DE RESIDUOS SOLIDOS Y LIQUIDOS.docx`

| Código | Documento | Tipo | Formato |
|---|---|---|---|
| RSL-MZ-02 | Matriz de generación | matriz | .xlsx |
| RSL-RG-01 | Control generación de residuos | registro | .xlsx |

---

## 7. Programa de Higiene Personal — `P-HPL-07`

**Documento maestro:** `P-HPL-07 PROGRAMA DE HIGIENE PERSONAL.docx`

| Código | Documento | Tipo | Formato |
|---|---|---|---|
| HPL-RG-01 | Control entrega dotaciones y EPP | registro | .xlsx |
| HPL-RG-02 | Control visitantes y proveedores | registro | .xlsx |
| HPL-RG-03 | Control inspección de personal | registro | .xlsx |
| HPL-RG-04 | Control enfermedades personal interno | registro | .xlsx |

---

## 8. Programa de Capacitación — `P-CAN-08`

**Documento maestro:** `P-CAN-08 PROGRAMA DE CAPACITACIÓN.docx`

| Código | Documento | Tipo | Formato |
|---|---|---|---|
| CAN-CR-01 | Cronograma de capacitaciones | cronograma | .xlsx |
| CAN-CR-03 | Formato encuesta capacitación | formato | .xlsx |
| CAN-FM-04 | Formato evaluación de la capacitación | formato | .docx |
| CAN-RG-02 | Acta de capacitación | registro | .xlsx |

---

## 9. Procedimiento de Producto No Conforme — `PR-PNC-09`

**Documento maestro:** `PR-PNC-09 PROGRAMA DE PRODUCTO NO CONFORME.doc`

| Código | Documento | Tipo | Formato |
|---|---|---|---|
| PNC-MZ-01 | Matriz no conformes | matriz | .xlsx |
| PNC-RG-02 | Registro no conformes externas | registro | .xlsx |
| PNC-RG-03 | Registro no conformes internas | registro | .xlsx |

---

## 10. Protocolo de Liberación de Producto — `PT-LPT-10`

**Documento maestro:** `PT-LPT-10 PROCEDIMIENTO DE LIBERACION DE PRODUCTO.docx`

| Código | Documento | Tipo | Formato |
|---|---|---|---|
| LPT-RG-02 | Registro control de lotes | registro | .xlsx |
| LTP-FM-02 | Formato liberación de producto terminado | formato | .xlsx |

---

## 11. Procedimiento y Control de Especificaciones de Producto — `PR-CEP-11`

**Documento maestro:** `PR-CEP-11 PROCEDIMIENTO Y CONTROL DE ESPECIFICACIONES DE PRODUCTO.doc`

| Código | Documento | Tipo | Formato |
|---|---|---|---|
| CEP-FTP-02 | Formato ficha técnica | formato | .doc |
| CEP-RG-01 | Registro control de actualización de fichas técnicas | registro | .xlsx |

### Fichas técnicas de producto
| Documento | Tipo | Formato |
|---|---|---|
| Ficha técnica Arazá | ficha_tecnica | .doc |
| Ficha técnica Asaí | ficha_tecnica | .doc |
| Ficha técnica Cacay | ficha_tecnica | .doc |
| Ficha técnica Copoazú | ficha_tecnica | .doc |
| Ficha técnica Moriche | ficha_tecnica | .doc |

---

## 12. Programa de Mantenimiento y Calibración — `P-MYC-12`

**Documento maestro:** `P-MYC-12 PROGRAMA DE MANTENIMIENTO Y CALIBRACION.doc`

| Código | Documento | Tipo | Formato |
|---|---|---|---|
| MYC-CR-01 | Cronograma calibración de equipos | cronograma | .xlsx |
| MYC-CR-02 | Cronograma calibración equipos de medición | cronograma | .xlsx |
| MYC-CR-03 | Cronograma mantenimiento locativo | cronograma | .xlsx |
| MYC-LI-01 | Lista de chequeo instalaciones | listado | .xlsx |
| MYC-RG-01 | Clasificación de equipos de medición | registro | .xlsx |
| MYC-RG-02 | Clasificación de equipos | registro | .xlsx |
| MYC-RG-03 | Registro de mantenimiento y calibración | registro | .xlsx |

---

## 13. Procedimiento de Recursos Humanos — `PR-RH-13`

**Documento maestro:** `PR-RH-13 PROCEDIMIENTO DE RECURSOS HUMANOS.docx`

| Código | Documento | Tipo | Formato |
|---|---|---|---|
| RH-LI-01 | Listado maestro de personal | listado | .xlsx |

---

## 14. Procedimiento de Compras y Proveedores — `PR-CPS-14`

**Documento maestro:** `PR-CPS-14 PROCEDIMIENTO DE COMPRAS Y PROVEEDORES.docx`

| Código | Documento | Tipo | Formato |
|---|---|---|---|
| CPS-FM-01 | Formato visita a proveedores | formato | .xlsx |
| CPS-LI-01 | Listado maestro proveedores | listado | .xlsx |
| CPS-MZ-01 | Matriz entregas proveedores | matriz | .xlsx |
| CPS-RG-01 | Requisición compra | registro | .xlsx |

---

## 15. Procedimiento de Trazabilidad — `PR-PTZ-15`

**Documento maestro:** `PR-PTZ-15 PROCEDIMIENTO DE TRAZABILIDAD.doc`

| Código | Documento | Tipo | Formato |
|---|---|---|---|
| LTP-CR-01 | Cronograma de trazabilidad | cronograma | .xlsx |
| PTZ-FM-01 | Simulacro trazabilidad | formato | .xlsx |
| PTZ-OR-01 | Orden de producción | orden | .xlsx |
| PTZ-RG-01 | Registro control de despachos | registro | .xlsx |
| PTZ-RG-02 | Registro control de temperaturas y humedad | registro | .xlsx |
| PTZ-RG-03 | Registro control producción diaria | registro | .xlsx |
| PTZ-RG-04 | Registro control vehículos transporte | registro | .xlsx |
| PTZ-RG-05 | Registro entrada de MP a producción | registro | .xlsx |
| PTZ-RG-06 | Registro entrada PT a bodega | registro | .xlsx |
| PTZ-RG-07 | Registro recibo cajas de cartón | registro | .xlsx |
| PTZ-RG-08 | Registro recibo de empaques | registro | .xlsx |
| PTZ-RG-09 | Registro recibo de materia prima | registro | .xlsx |

> 🔗 **Integración:** `PTZ-OR-01`, `PTZ-RG-03`, `PTZ-RG-05`, `PTZ-RG-06`, `PTZ-RG-09` se corresponden con módulos ya existentes en el sistema (Órdenes de Producción, Producción diaria, Inventario MP/PT).

---

## 16. Programa de Almacenamiento y Transporte — `P-AYL-16`

**Documento maestro:** `P-AYL-14 PROGRAMA DE ALMACENAMIENTO Y TRANSPORTE.docx`

| Código | Documento | Tipo | Formato |
|---|---|---|---|
| ALMT-RG-01 | Inspección de vehículos | registro | .xlsx |
| ALT-SP-01 | Solicitud de despacho | solicitud | .xlsx |

---

## 17. Procedimiento de Acciones Correctivas, Preventivas y de Mejora — `PR-CPM-17`

**Documento maestro:** `PR-CPM-17 PROCEDIMIENTO DE ACCIONES CORRECTIVAS Y DE MEJORA.docx`

| Código | Documento | Tipo | Formato |
|---|---|---|---|
| CPM-RG-01 | Registro control ACPM | registro | .xlsx |
| CPM-RG-02 | Registro seguimiento ACPM | registro | .xlsx |
| CPM-RG-03 | Informe ACPM | registro | .xlsx |

---

## Documentos sueltos (raíz de SISTEMA DOCUMENTAL)

| Documento | Tipo | Formato |
|---|---|---|
| Asistencia laboral por horas semanales | registro | .xlsx |
| Control materia prima en congelador | registro | .xlsx |

---

## Anexo A — Gestión Ambiental (Proyecto ADEMI)

> Carpeta `docs/Gestión ambiental/ASOCIACIÓN PARA EL EMPRENDIMIENTO INNOVADOR DEL GUAVIARE/`.
> Material de un proyecto/entregable ambiental (no es parte del SGC interno; clasificar como `ambiental`).

### Entregables ADEMI
| Documento | Tipo | Formato |
|---|---|---|
| Informe final ADEMI | ambiental | .docx |
| Flujograma de procesos | ambiental | .docx |
| Guía de buenas prácticas ambientales ADEMI | ambiental | .docx |
| Política, estrategias y campañas ambientales | ambiental | .docx |
| Programa de educación y sensibilización ambiental | ambiental | .docx |
| Ficha técnica control ambiental | ambiental | .xlsx |

### PMIRS (Plan de Manejo Integral de Residuos Sólidos)
| Documento | Tipo | Formato |
|---|---|---|
| PMIRS ADEMI | ambiental | .docx |
| Análisis cualitativo | ambiental | .xlsx |
| Caracterización de RS | ambiental | .xlsx |
| Formato No. 1 — Registro volumen residuos | formato | .xlsx |
| Formato No. 2 — Seguimiento PMIRS | formato | .xlsx |
| Anexo 1 / Anexo 2 | ambiental | .pdf |

### Capacitación de Residuos y Buenas Prácticas Ambientales
| Documento | Tipo |
|---|---|
| Listado de asistencia ADEMI | registro (.pdf) |
| Memoria Residuos Sólidos ADEMI | ambiental (.docx) |
| Pre-test / Post-test residuos sólidos | evaluación (.pdf) |
| Transcripción listado RS y BA | registro (.xlsx) |
| Registro fotográfico (28 imágenes) | evidencia (.jpeg) |

---

## Anexo B — Estructura propuesta para integración (tabla `documentos`)

Para cargar este catálogo en una tabla de la base de datos:

```sql
CREATE TABLE IF NOT EXISTS documentos (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo      text,                 -- ej. 'PR-PTZ-15', 'L&D-POES-8'
  nombre      text NOT NULL,        -- ej. 'Procedimiento de Trazabilidad'
  tipo        text,                 -- manual|programa|procedimiento|protocolo|registro|formato|cronograma|listado|matriz|poes|pos|ficha_tecnica|ambiental
  proceso     text,                 -- ej. '15. Trazabilidad' (proceso padre)
  formato     text,                 -- docx|doc|xlsx|pdf
  ruta        text,                 -- ruta relativa en docs/ o URL de Storage
  archivo_url text,                 -- URL del archivo subido a Supabase Storage
  version     text,                 -- control de versiones
  vigente     boolean DEFAULT true,
  actualizado_at timestamptz DEFAULT now()
);
```

**Recomendación de integración:**
1. Crear bucket de Storage `documentos` y subir los archivos.
2. Cargar este catálogo como filas (campo `archivo_url` apuntando al Storage).
3. Módulo **Documentos**: listado con filtro por `proceso` y `tipo`, con botón de descarga (igual a la ficha técnica de productos) y control de `version`/`vigente`.
4. Vincular los registros operativos ya existentes (Órdenes, Producción, Inventario) a sus formatos del SGC (sección 15).

---

### Resumen cuantitativo
- **18 procesos** del Sistema Documental (Manual BPM + 17 programas/procedimientos).
- **~70 documentos** controlados (maestros + registros + formatos + POES/POS).
- **5 fichas técnicas** de producto (Arazá, Asaí, Cacay, Copoazú, Moriche).
- **Anexo ambiental** (ADEMI) con entregables, PMIRS y evidencias de capacitación.
