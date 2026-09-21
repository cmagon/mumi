-- v176 · Clientes: campos para enlazar/importar contactos desde Alegra.
--
-- El módulo Clientes pasa a ser el directorio maestro: se importan los CONTACTOS que son
-- clientes en Alegra (no proveedores) y se enriquecen con los campos locales que Alegra no
-- maneja (canal, observaciones). La identidad/facturación (NIT y razón social) es de solo
-- lectura en la app; se administra en Alegra.
--
-- Aplicar:  psql "$DATABASE_URL" -f supabase/migration_v176_clientes_alegra.sql
--   (o pegar en el SQL Editor de Supabase)

ALTER TABLE clients ADD COLUMN IF NOT EXISTS alegra_id TEXT DEFAULT '';           -- id del contacto en Alegra (vacío = solo local)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS nit TEXT DEFAULT '';                 -- identificación (NIT/CC) — no editable en la app
ALTER TABLE clients ADD COLUMN IF NOT EXISTS razon_social TEXT DEFAULT '';        -- nombre legal en Alegra — no editable en la app
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tipo_identificacion TEXT DEFAULT ''; -- NIT, CC, CE, etc.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS direccion TEXT DEFAULT '';           -- dirección (editable, se empuja a Alegra)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS alegra_sync_at TIMESTAMPTZ;          -- última vez que se importó/actualizó desde Alegra

-- Un contacto de Alegra no puede duplicarse en la tabla (el import hace upsert por este id).
CREATE UNIQUE INDEX IF NOT EXISTS clients_alegra_id_uq ON clients (alegra_id) WHERE alegra_id <> '';
