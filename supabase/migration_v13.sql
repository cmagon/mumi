-- ============================================================
-- MUMI AMAZONIA — Migration v13 (idempotente)
-- Parámetros de liquidación de nómina (Código Sustantivo del Trabajo)
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS payroll_settings (
  id         int PRIMARY KEY DEFAULT 1,
  params     jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_settings_single CHECK (id = 1)
);

ALTER TABLE payroll_settings ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado (el cálculo de nómina lo usa)
DROP POLICY IF EXISTS payroll_settings_select ON payroll_settings;
CREATE POLICY payroll_settings_select ON payroll_settings
  FOR SELECT TO authenticated USING (true);

-- Escritura: solo administradores
DROP POLICY IF EXISTS payroll_settings_write ON payroll_settings;
CREATE POLICY payroll_settings_write ON payroll_settings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.rol = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.rol = 'admin'));

-- Fila única inicial (valores por defecto los pone la app si params está vacío)
INSERT INTO payroll_settings (id, params) VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
