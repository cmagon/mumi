-- ============================================================
-- migration_v49_hardening.sql
-- Punto 3 de la auditoría (severidad media):
--   A) Bucket 'documentos': quitar la ENUMERACIÓN anónima del Storage.
--   B) Rate-limiting de inserts anónimos (password_requests, share_solicitudes).
-- ============================================================

-- ------------------------------------------------------------
-- A) STORAGE: cerrar la enumeración anónima del bucket 'documentos'
-- ------------------------------------------------------------
-- El bucket es PÚBLICO, así que las descargas por URL (logo, documentos compartidos)
-- siguen funcionando vía CDN sin depender de esta política. Lo único que habilitaba la
-- política anónima era LISTAR/enumerar objetos por la API de Storage, cosa que la app
-- no hace. Se elimina para que un anónimo no pueda recorrer todos los archivos.
--
-- ⚠️ Verifica que el bucket 'documentos' sea PÚBLICO (Storage → bucket → Public).
--    Si por algún motivo fuera privado, el logo en pantallas sin sesión dejaría de verse;
--    en ese caso, vuelve a crear la política pero acotada a un prefijo público.
DROP POLICY IF EXISTS documentos_obj_public_read ON storage.objects;

-- ------------------------------------------------------------
-- B) RATE-LIMITING de inserts anónimos
-- ------------------------------------------------------------
-- Limita cuántas filas se pueden insertar en una ventana de tiempo (defensa anti-flood).
-- Parámetros vía TG_ARGV: [0]=ventana (interval), [1]=máximo de filas en esa ventana.
CREATE OR REPLACE FUNCTION rate_limit_inserts()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  ventana interval := (TG_ARGV[0])::interval;
  maximo  int      := (TG_ARGV[1])::int;
  n int;
BEGIN
  EXECUTE format('SELECT count(*) FROM %I.%I WHERE created_at > now() - $1', TG_TABLE_SCHEMA, TG_TABLE_NAME)
    INTO n USING ventana;
  IF n >= maximo THEN
    RAISE EXCEPTION 'Demasiadas solicitudes en poco tiempo. Intenta de nuevo en unos minutos.';
  END IF;
  RETURN NEW;
END $$;

-- password_requests: máx. 5 solicitudes cada 5 minutos (en toda la tabla).
DROP TRIGGER IF EXISTS trg_rl_password_requests ON password_requests;
CREATE TRIGGER trg_rl_password_requests
  BEFORE INSERT ON password_requests
  FOR EACH ROW EXECUTE FUNCTION rate_limit_inserts('5 minutes', '5');

-- share_solicitudes: máx. 20 solicitudes cada 5 minutos.
DROP TRIGGER IF EXISTS trg_rl_share_solicitudes ON share_solicitudes;
CREATE TRIGGER trg_rl_share_solicitudes
  BEFORE INSERT ON share_solicitudes
  FOR EACH ROW EXECUTE FUNCTION rate_limit_inserts('5 minutes', '20');
