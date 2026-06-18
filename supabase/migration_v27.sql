-- ============================================================
-- MUMI AMAZONIA — Migration v27 (idempotente)
-- Motor de Registros diligenciables ("Libros de Registro" del SGC BPM)
--   - registro_plantillas: define cada registro de un programa/procedimiento,
--     con campos configurables, periodicidad y alertas.
--   - registro_entradas: cada registro diligenciado (con fecha, datos, evidencia).
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- ADEMÁS (manual, una sola vez): Storage → New bucket → "documentos" (público) [ya creado en v26]
-- ============================================================

CREATE TABLE IF NOT EXISTS registro_plantillas (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo        text,                 -- ej. 'PTZ-RG-02' (enlaza con documentos.codigo)
  nombre        text NOT NULL,        -- ej. 'Control de Temperaturas y Humedad'
  programa      text,                 -- proceso padre, ej. '15. Trazabilidad'
  descripcion   text,
  campos        jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{key,label,tipo,opciones,requerido}]
  periodica     boolean DEFAULT false,
  dias_periodo  int DEFAULT 0,        -- frecuencia en días (ej. 30 = mensual)
  genera_alerta boolean DEFAULT false,
  dias_aviso    int DEFAULT 7,        -- avisar N días antes del próximo vencimiento
  activo        boolean DEFAULT true,
  orden         int DEFAULT 0,
  creado_por    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_registro_plantillas_prog ON registro_plantillas (programa);

CREATE TABLE IF NOT EXISTS registro_entradas (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plantilla_id   bigint REFERENCES registro_plantillas(id) ON DELETE CASCADE,
  fecha          date NOT NULL DEFAULT current_date,
  datos          jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {campo_key: valor}
  observaciones  text,
  proxima_fecha  date,                 -- próxima vez que debe hacerse (si es periódica)
  responsable    text,
  storage_path   text,                 -- evidencia adjunta (opcional)
  storage_url    text,
  archivo_nombre text,
  creado_por     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_registro_entradas_plant ON registro_entradas (plantilla_id, fecha DESC);

ALTER TABLE registro_plantillas ENABLE ROW LEVEL SECURITY;
ALTER TABLE registro_entradas  ENABLE ROW LEVEL SECURITY;

-- Plantillas: todos ven; solo admin crea/edita
DROP POLICY IF EXISTS registro_plantillas_select ON registro_plantillas;
CREATE POLICY registro_plantillas_select ON registro_plantillas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS registro_plantillas_write ON registro_plantillas;
CREATE POLICY registro_plantillas_write ON registro_plantillas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.rol = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.rol = 'admin'));

-- Entradas: todos ven; cualquier autenticado diligencia; solo admin elimina/edita
DROP POLICY IF EXISTS registro_entradas_select ON registro_entradas;
CREATE POLICY registro_entradas_select ON registro_entradas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS registro_entradas_insert ON registro_entradas;
CREATE POLICY registro_entradas_insert ON registro_entradas FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS registro_entradas_modify ON registro_entradas;
CREATE POLICY registro_entradas_modify ON registro_entradas FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.rol = 'admin'));
DROP POLICY IF EXISTS registro_entradas_delete ON registro_entradas;
CREATE POLICY registro_entradas_delete ON registro_entradas FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.rol = 'admin'));
