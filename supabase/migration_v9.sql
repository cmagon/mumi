-- ============================================================
-- MUMI AMAZONIA — Migration v9 (idempotente)
-- Permitir el rol 'auxiliar' en user_profiles
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_rol_check;
ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_rol_check
  CHECK (rol IN ('admin','operario','auxiliar','ventas','readonly'));
