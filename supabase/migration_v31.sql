-- ============================================================
-- MUMI AMAZONIA — Migration v31 (idempotente)
-- Módulo de Capacitación (P-CAN-08): temas, asistentes y evaluación.
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- (Evidencia/soportes usan el bucket público "documentos" de v26.)
-- ============================================================

CREATE TABLE IF NOT EXISTS capacitaciones (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tema            text NOT NULL,
  fecha           date NOT NULL DEFAULT current_date,
  instructor      text,
  lugar           text,
  duracion_horas  numeric DEFAULT 1,
  tipo            text DEFAULT 'BPM',     -- BPM | HACCP | Seguridad | Calidad | Inducción | Otro
  descripcion     text,
  asistentes      jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{nombre, cargo, nota, aprobado}]
  proxima_fecha   date,                   -- si es periódica (refuerzo)
  storage_path    text,
  storage_url     text,
  archivo_nombre  text,
  creado_por      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_capacitaciones_fecha ON capacitaciones (fecha DESC);

ALTER TABLE capacitaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS capacitaciones_select ON capacitaciones;
CREATE POLICY capacitaciones_select ON capacitaciones FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS capacitaciones_insert ON capacitaciones;
CREATE POLICY capacitaciones_insert ON capacitaciones FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS capacitaciones_modify ON capacitaciones;
CREATE POLICY capacitaciones_modify ON capacitaciones FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS capacitaciones_delete ON capacitaciones;
CREATE POLICY capacitaciones_delete ON capacitaciones FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.rol = 'admin'));
