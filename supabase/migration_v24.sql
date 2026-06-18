-- ============================================================
-- MUMI AMAZONIA — Migration v24 (idempotente)
-- Márgenes de precios sugeridos (configurables por el admin)
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS costing_settings (
  id        int PRIMARY KEY DEFAULT 1,
  margenes  jsonb NOT NULL DEFAULT '[30,35,40,45,47]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT costing_settings_single CHECK (id = 1)
);

ALTER TABLE costing_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS costing_settings_select ON costing_settings;
CREATE POLICY costing_settings_select ON costing_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS costing_settings_write ON costing_settings;
CREATE POLICY costing_settings_write ON costing_settings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.rol = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = auth.uid() AND up.rol = 'admin'));

INSERT INTO costing_settings (id, margenes) VALUES (1, '[30,35,40,45,47]'::jsonb)
ON CONFLICT (id) DO NOTHING;
