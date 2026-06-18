-- ============================================================
-- MUMI AMAZONIA — Migration v30 (idempotente)
-- No Conformidades + ACPM (Acciones Correctivas, Preventivas y de Mejora)
--   Procedimientos PR-PNC-09 y PR-CPM-17 del SGC.
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- (La evidencia usa el bucket público "documentos" creado en v26.)
-- ============================================================

CREATE TABLE IF NOT EXISTS no_conformidades (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo           text,                 -- ej. 'NC-2026-001'
  fecha            date NOT NULL DEFAULT current_date,
  tipo             text DEFAULT 'interna',   -- interna | externa
  origen           text,                 -- producto | proceso | cliente | proveedor | auditoria | otro
  descripcion      text NOT NULL,
  producto         text,
  lote             text,
  detectado_por    text,
  severidad        text DEFAULT 'media', -- baja | media | alta | critica
  -- ACPM
  accion_inmediata text,
  causa_raiz       text,
  accion_correctiva text,
  tipo_accion      text DEFAULT 'correctiva', -- correctiva | preventiva | mejora
  responsable      text,
  fecha_compromiso date,
  fecha_cierre     date,
  eficaz           boolean,
  estado           text DEFAULT 'abierta', -- abierta | en_proceso | cerrada
  storage_path     text,
  storage_url      text,
  archivo_nombre   text,
  creado_por       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_no_conformidades_estado ON no_conformidades (estado, fecha DESC);

ALTER TABLE no_conformidades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS no_conformidades_select ON no_conformidades;
CREATE POLICY no_conformidades_select ON no_conformidades FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS no_conformidades_insert ON no_conformidades;
CREATE POLICY no_conformidades_insert ON no_conformidades FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS no_conformidades_modify ON no_conformidades;
CREATE POLICY no_conformidades_modify ON no_conformidades FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS no_conformidades_delete ON no_conformidades;
CREATE POLICY no_conformidades_delete ON no_conformidades FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.rol = 'admin'));
