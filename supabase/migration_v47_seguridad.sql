-- ============================================================
-- migration_v47_seguridad.sql
-- Correcciones de seguridad de la auditoría:
--   1) Escalada de privilegios: bloquear que un no-admin cambie su rol/estado/etc.
--   2) Contraseñas en claro: mover password_visible a tabla user_secrets (solo admin).
--   6) Enumeración de comparticiones: quitar lectura anónima total de document_shares
--      y exponer solo el acceso por token mediante una función SECURITY DEFINER.
-- Aplicar:  supabase db push   (o pegar en el SQL Editor de Supabase)
-- ============================================================

-- ------------------------------------------------------------
-- 1) ANTI-ESCALADA DE PRIVILEGIOS EN user_profiles
-- ------------------------------------------------------------
-- La política "Self update profile" permitía a cualquier usuario actualizar su
-- propia fila SIN restringir columnas, por lo que podía ponerse rol='admin'.
-- La conservamos (para 'ultimo_acceso' y datos propios), pero un trigger impide
-- que un no-admin toque columnas sensibles.

CREATE OR REPLACE FUNCTION protect_profile_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Los admin pueden cambiar todo (política "Admin write").
  IF get_my_role() = 'admin' THEN
    RETURN NEW;
  END IF;
  -- Un no-admin no puede modificar columnas de seguridad de NINGUNA fila.
  IF NEW.rol             IS DISTINCT FROM OLD.rol
     OR NEW.estado       IS DISTINCT FROM OLD.estado
     OR NEW.login        IS DISTINCT FROM OLD.login
     OR NEW.id           IS DISTINCT FROM OLD.id
     OR NEW.es_desarrollador IS DISTINCT FROM OLD.es_desarrollador THEN
    RAISE EXCEPTION 'No autorizado a modificar rol/estado/login/es_desarrollador';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_profile ON user_profiles;
CREATE TRIGGER trg_protect_profile
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_columns();

-- ------------------------------------------------------------
-- 2) CONTRASEÑAS EN CLARO → tabla user_secrets (solo admin)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_secrets (
  id               UUID PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
  password_visible TEXT,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Migrar los valores existentes (si la columna aún existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'password_visible'
  ) THEN
    INSERT INTO user_secrets (id, password_visible)
      SELECT id, password_visible FROM user_profiles WHERE password_visible IS NOT NULL
      ON CONFLICT (id) DO UPDATE SET password_visible = EXCLUDED.password_visible;
    ALTER TABLE user_profiles DROP COLUMN password_visible;
  END IF;
END $$;

ALTER TABLE user_secrets ENABLE ROW LEVEL SECURITY;

-- Solo el admin puede leer/gestionar las claves de OTROS usuarios.
DROP POLICY IF EXISTS user_secrets_admin ON user_secrets;
CREATE POLICY user_secrets_admin ON user_secrets FOR ALL TO authenticated
  USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');

-- Cada usuario puede escribir/leer SOLO su propia clave (para cambiarla él mismo).
DROP POLICY IF EXISTS user_secrets_self ON user_secrets;
CREATE POLICY user_secrets_self ON user_secrets FOR ALL TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ------------------------------------------------------------
-- 6) COMPARTICIONES: quitar lectura anónima total
-- ------------------------------------------------------------
-- Antes: FOR SELECT TO anon USING (true) → un anónimo listaba TODAS las comparticiones.
-- Ahora: los usuarios internos (authenticated) siguen leyendo; el público accede
--        únicamente por token vía función SECURITY DEFINER.
DROP POLICY IF EXISTS document_shares_read ON document_shares;
CREATE POLICY document_shares_auth_read ON document_shares
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.get_share(p_token uuid)
RETURNS SETOF document_shares
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT * FROM document_shares WHERE token = p_token;
$$;
REVOKE ALL ON FUNCTION public.get_share(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_share(uuid) TO anon, authenticated;
