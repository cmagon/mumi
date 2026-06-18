-- ============================================================
-- MUMI AMAZONIA — Migration v26 (idempotente)
-- Módulo de Gestión Documental (Sistema de Calidad BPM/HACCP)
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- ADEMÁS (manual, una sola vez):
--   Storage → New bucket → nombre: "documentos" → Public bucket: ON
-- ============================================================

CREATE TABLE IF NOT EXISTS documentos (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo          text,                -- ej. 'PR-PTZ-15', 'L&D-POES-8'
  nombre          text NOT NULL,       -- ej. 'Procedimiento de Trazabilidad'
  tipo            text,                -- manual|programa|procedimiento|protocolo|registro|formato|cronograma|listado|matriz|poes|pos|ficha_tecnica|ambiental
  proceso         text,                -- proceso padre, ej. '15. Trazabilidad'
  descripcion     text,
  version         text DEFAULT '1',
  vigente         boolean DEFAULT true,
  storage_path    text,                -- ruta del archivo en el bucket 'documentos'
  storage_url     text,
  archivo_nombre  text,                -- nombre original del archivo
  modulo_link     text,                -- ruta interna si el formato ya tiene módulo (ej. '/produccion')
  creado_por      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documentos_proceso ON documentos (proceso);
CREATE INDEX IF NOT EXISTS idx_documentos_tipo ON documentos (tipo);

ALTER TABLE documentos ENABLE ROW LEVEL SECURITY;

-- Todos los autenticados pueden ver/descargar
DROP POLICY IF EXISTS documentos_select ON documentos;
CREATE POLICY documentos_select ON documentos FOR SELECT TO authenticated USING (true);

-- Solo admin puede crear/editar/eliminar
DROP POLICY IF EXISTS documentos_write ON documentos;
CREATE POLICY documentos_write ON documentos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.rol = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.rol = 'admin'));

-- Historial de versiones de cada documento (para descargar versiones anteriores)
CREATE TABLE IF NOT EXISTS documento_versiones (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  documento_id  bigint REFERENCES documentos(id) ON DELETE CASCADE,
  version       text,
  storage_path  text,
  storage_url   text,
  archivo_nombre text,
  nota          text,
  creado_por    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documento_versiones_doc ON documento_versiones (documento_id, created_at DESC);

ALTER TABLE documento_versiones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS documento_versiones_select ON documento_versiones;
CREATE POLICY documento_versiones_select ON documento_versiones FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS documento_versiones_write ON documento_versiones;
CREATE POLICY documento_versiones_write ON documento_versiones FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.rol = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.rol = 'admin'));
