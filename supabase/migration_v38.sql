-- ============================================================
-- MUMI AMAZONIA — Migration v38 (idempotente)
-- Configuración y personalización de la empresa (colores, fuente, logo, datos).
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- (El logo usa el bucket público "documentos" de v26.)
-- ============================================================

CREATE TABLE IF NOT EXISTS app_settings (
  id         int PRIMARY KEY DEFAULT 1,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_single CHECK (id = 1)
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_settings_select ON app_settings;
CREATE POLICY app_settings_select ON app_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS app_settings_write ON app_settings;
CREATE POLICY app_settings_write ON app_settings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.rol = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.rol = 'admin'));

INSERT INTO app_settings (id, data) VALUES (1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING;
