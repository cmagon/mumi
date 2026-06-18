-- ============================================================
-- MUMI AMAZONIA — Migration v8 (idempotente)
-- Buzón de notificaciones
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  destinatario TEXT NOT NULL,        -- 'admin' (todos los admin) o el nombre del usuario destino
  tipo TEXT DEFAULT 'info',          -- orden_enviada | registro_pendiente | orden_asignada | orden_aprobada | orden_rechazada | info
  mensaje TEXT NOT NULL,
  link TEXT DEFAULT '',              -- ruta para navegar (ej '/ordenes')
  ref_id INTEGER,
  leido BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_dest ON notifications(destinatario, leido);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Notif read"  ON notifications;
DROP POLICY IF EXISTS "Notif write" ON notifications;
CREATE POLICY "Notif read"  ON notifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Notif write" ON notifications FOR ALL    TO authenticated USING (true) WITH CHECK (true);
