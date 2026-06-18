-- ============================================================
-- MUMI AMAZONIA — Migration v37 (idempotente)
-- Enlaza una No Conformidad con su origen (producción, registro, etc.)
-- para sugerirlas automáticamente y evitar duplicados.
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE no_conformidades ADD COLUMN IF NOT EXISTS origen_ref text;
-- origen_ref: 'prod-<id>' (registro de producción), 'reg-<id>' (libro de registro), etc.
CREATE INDEX IF NOT EXISTS idx_no_conformidades_origen ON no_conformidades (origen_ref);
