-- ============================================================
-- MUMI AMAZONIA — Migration v12 (idempotente)
-- 1) Etiqueta visible para roles personalizados
-- 2) Permitir roles personalizados en user_profiles (quita el CHECK rígido)
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1) Columna label en role_permissions
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS label text;

-- Etiquetas por defecto para los roles base (si están en la tabla)
UPDATE role_permissions SET label = 'Operario de Producción' WHERE rol = 'operario' AND label IS NULL;
UPDATE role_permissions SET label = 'Auxiliar de Producción' WHERE rol = 'auxiliar' AND label IS NULL;

-- 2) El admin puede crear roles nuevos → ya no se restringe a una lista fija.
--    (Se mantiene como texto no vacío.)
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_rol_check;
ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_rol_check
  CHECK (rol IS NOT NULL AND length(trim(rol)) > 0);
