-- ============================================================
-- MUMI AMAZONIA — Migration v14 (idempotente)
-- Registros de liquidación de nómina guardados
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS payroll_records (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  emp_id      bigint,
  empleado    text,
  periodo     text,
  mes         int,
  anio        int,
  tipo        text,
  resultado   jsonb,
  creado_por  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;

-- Lectura y escritura: solo administradores
DROP POLICY IF EXISTS payroll_records_all ON payroll_records;
CREATE POLICY payroll_records_all ON payroll_records
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.rol = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.rol = 'admin'));
