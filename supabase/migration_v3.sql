-- ============================================================
-- MUMI AMAZONIA — Migration v3 (idempotente)
-- Inventario avanzado + Órdenes de Producción
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1) Campos extra en materias primas (lote, vencimiento, observaciones, campos personalizados)
ALTER TABLE raw_materials
  ADD COLUMN IF NOT EXISTS lote        TEXT  DEFAULT '',
  ADD COLUMN IF NOT EXISTS vencimiento DATE,
  ADD COLUMN IF NOT EXISTS obs         TEXT  DEFAULT '',
  ADD COLUMN IF NOT EXISTS extra       JSONB DEFAULT '{}';

-- 2) Campos extra en movimientos de inventario
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS lote        TEXT  DEFAULT '',
  ADD COLUMN IF NOT EXISTS vencimiento DATE,
  ADD COLUMN IF NOT EXISTS extra       JSONB DEFAULT '{}';

-- 3) Tabla de categorías de materia prima (gestionables)
CREATE TABLE IF NOT EXISTS mp_categories (
  id SERIAL PRIMARY KEY,
  nombre TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO mp_categories (nombre) VALUES
  ('pulpa'),('deshidratado'),('subproducto'),('aditivo'),('harina'),('empaque'),('otro')
ON CONFLICT (nombre) DO NOTHING;

-- 4) Órdenes de producción
CREATE TABLE IF NOT EXISTS production_orders (
  id SERIAL PRIMARY KEY,
  -- Definición de la orden (la crea el admin)
  producto         TEXT NOT NULL,           -- nombre de receta/producto
  origen           TEXT DEFAULT 'producto', -- 'producto' | 'receta'
  origen_id        INTEGER,                 -- id del producto o receta
  es_subproducto   BOOLEAN DEFAULT FALSE,   -- si TRUE alimenta Inventario MP, no el registro de producción
  mp_id            INTEGER REFERENCES raw_materials(id) ON DELETE SET NULL,  -- MP que alimenta si es subproducto
  cantidad_plan    NUMERIC DEFAULT 0,
  unidad           TEXT DEFAULT 'unidades',
  operario         TEXT DEFAULT '',         -- operario asignado (nombre)
  notas_orden      TEXT DEFAULT '',
  -- Estado del flujo
  estado           TEXT DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente','en_proceso','ejecutada','aprobada','rechazada')),
  -- Resultados (los ingresa el operario)
  cantidad_result  NUMERIC,
  lote             TEXT DEFAULT '',
  vence            DATE,
  fecha_prod       DATE,
  inicio           TIME,
  fin              TIME,
  empaque          TEXT DEFAULT '',
  obs_result       TEXT DEFAULT '',
  foto_url         TEXT DEFAULT '',
  -- Aprobación (solo admin)
  aprobado_por     TEXT DEFAULT '',
  fecha_aprob      TIMESTAMPTZ,
  motivo_rechazo   TEXT DEFAULT '',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE mp_categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_orders ENABLE ROW LEVEL SECURITY;

-- mp_categories: lectura todos; escritura admin
DROP POLICY IF EXISTS "Read cats"  ON mp_categories;
DROP POLICY IF EXISTS "Admin cats" ON mp_categories;
CREATE POLICY "Read cats"  ON mp_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin cats" ON mp_categories FOR ALL TO authenticated
  USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');

-- production_orders:
--  - lectura: todos los autenticados
--  - crear/eliminar/aprobar: admin
--  - actualizar (ejecutar y enviar resultados): admin u operario
DROP POLICY IF EXISTS "Read orders"   ON production_orders;
DROP POLICY IF EXISTS "Admin orders"  ON production_orders;
DROP POLICY IF EXISTS "Op update orders" ON production_orders;
CREATE POLICY "Read orders"  ON production_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin orders" ON production_orders FOR ALL TO authenticated
  USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "Op update orders" ON production_orders FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin','operario'))
  WITH CHECK (get_my_role() IN ('admin','operario'));

-- 5) Bucket para fotos de órdenes (reusa production-photos si ya existe)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('production-photos', 'production-photos', false)
ON CONFLICT (id) DO NOTHING;
