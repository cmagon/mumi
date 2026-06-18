-- ============================================================
-- MUMI AMAZONIA — Migration v7 (idempotente)
-- Asistencia: varias sesiones por día + auditoría (solo admin)
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- Permitir VARIAS sesiones (entrada/salida) por empleado/día → quitar la restricción única
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_emp_id_fecha_key;

-- Auditoría: fecha/hora real en que se registró cada marca (solo la ve el admin)
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS entrada_ts  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS salida_ts   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS editado_ts  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS editado_por TEXT DEFAULT '';

-- RLS: cualquier usuario autenticado puede leer/registrar asistencia
-- (la app limita qué puede editar cada rol)
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Asist read"  ON attendance;
DROP POLICY IF EXISTS "Asist write" ON attendance;
CREATE POLICY "Asist read"  ON attendance FOR SELECT TO authenticated USING (true);
CREATE POLICY "Asist write" ON attendance FOR ALL    TO authenticated USING (true) WITH CHECK (true);
