-- ============================================================
-- MUMI AMAZONIA — Supabase Schema v2.0
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- Perfiles de usuario (extiende auth.users de Supabase Auth)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nombre TEXT NOT NULL,
  login TEXT UNIQUE NOT NULL,
  rol TEXT NOT NULL DEFAULT 'operario' CHECK (rol IN ('admin','operario','ventas','readonly')),
  estado TEXT NOT NULL DEFAULT 'activo',
  ultimo_acceso TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Empleados
CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  cargo TEXT DEFAULT 'Operario',
  tipo_pago TEXT DEFAULT 'nomina' CHECK (tipo_pago IN ('nomina','horas','destajo')),
  salario NUMERIC DEFAULT 1750905,
  cedula TEXT DEFAULT '',
  telefono TEXT DEFAULT '',
  estado TEXT DEFAULT 'activo',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Materias primas
CREATE TABLE IF NOT EXISTS raw_materials (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  categoria TEXT DEFAULT 'otro',
  tipo TEXT DEFAULT 'comprado' CHECK (tipo IN ('comprado','interno')),
  unidad TEXT DEFAULT 'Kg',
  precio NUMERIC DEFAULT 0,
  stock_min NUMERIC DEFAULT 0,
  stock NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CIF (Costos Indirectos de Fabricación)
CREATE TABLE IF NOT EXISTS cif_items (
  id SERIAL PRIMARY KEY,
  descripcion TEXT NOT NULL,
  categoria TEXT DEFAULT 'General',
  frecuencia TEXT DEFAULT 'mensual' CHECK (frecuencia IN ('mensual','trimestral','semestral','anual')),
  valor NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Configuración global de la app (ej: cifUnidades fallback)
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value JSONB
);

-- Fichas de costos por producto
CREATE TABLE IF NOT EXISTS products_costing (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT DEFAULT 'galleta',
  bache NUMERIC DEFAULT 70,
  baches_mes NUMERIC DEFAULT 3,
  merma NUMERIC DEFAULT 2,
  comision NUMERIC DEFAULT 3,
  precio_mayor NUMERIC DEFAULT 0,
  precio_detal NUMERIC DEFAULT 0,
  ingredientes JSONB DEFAULT '[]',
  procesos JSONB DEFAULT '[]',
  empaque JSONB DEFAULT '[]',
  costo_final NUMERIC DEFAULT 0,
  cif_unit NUMERIC DEFAULT 0,
  util_mayor NUMERIC DEFAULT 0,
  util_detal NUMERIC DEFAULT 0,
  pe NUMERIC DEFAULT 0,
  fecha_creado DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recetas
CREATE TABLE IF NOT EXISTS recipes (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT DEFAULT 'normal' CHECK (tipo IN ('base','normal')),
  brix NUMERIC DEFAULT 75,
  brix_aplica BOOLEAN DEFAULT FALSE,
  rendimiento NUMERIC DEFAULT 62,
  desperdicio NUMERIC DEFAULT 2,
  peso_unidad NUMERIC DEFAULT 1000,
  ingredientes JSONB DEFAULT '[]',
  ancla TEXT DEFAULT '',
  cantidad_ancla NUMERIC DEFAULT 0,
  imagen_url TEXT DEFAULT '',
  ficha_nombre TEXT DEFAULT '',
  ficha_url TEXT DEFAULT '',
  fecha DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Registros de producción
CREATE TABLE IF NOT EXISTS production_records (
  id SERIAL PRIMARY KEY,
  producto TEXT NOT NULL,
  fecha DATE NOT NULL,
  lote TEXT DEFAULT '',
  vence DATE,
  empaque TEXT DEFAULT 'UNIDADES',
  cantidad NUMERIC DEFAULT 0,
  inicio TIME,
  fin TIME,
  labor TEXT DEFAULT '',
  responsable TEXT DEFAULT '',
  obs TEXT DEFAULT '',
  foto_url TEXT DEFAULT '',
  estado TEXT DEFAULT 'conforme' CHECK (estado IN ('conforme','no conforme')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clientes
CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  contacto TEXT DEFAULT '',
  telefono TEXT DEFAULT '',
  email TEXT DEFAULT '',
  canal TEXT DEFAULT 'mayor' CHECK (canal IN ('mayor','detal','feria','ecommerce','whatsapp')),
  ciudad TEXT DEFAULT '',
  obs TEXT DEFAULT '',
  fecha_reg DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Galería fotográfica
CREATE TABLE IF NOT EXISTS gallery_photos (
  id SERIAL PRIMARY KEY,
  storage_path TEXT DEFAULT '',
  categoria TEXT DEFAULT 'produccion' CHECK (categoria IN ('produccion','producto','inventario','evento','empleados','otro')),
  fecha DATE DEFAULT CURRENT_DATE,
  descripcion TEXT DEFAULT '',
  etiquetas TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Asistencia
CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  emp_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  entrada TIME,
  salida TIME,
  UNIQUE(emp_id, fecha)
);

-- Movimientos de inventario
CREATE TABLE IF NOT EXISTS inventory_movements (
  id SERIAL PRIMARY KEY,
  mp_id INTEGER REFERENCES raw_materials(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada','salida','ajuste')),
  cantidad NUMERIC NOT NULL,
  fecha DATE DEFAULT CURRENT_DATE,
  responsable TEXT DEFAULT '',
  obs TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE cif_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE products_costing ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

-- Helper: obtener rol del usuario actual
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER AS $$
  SELECT rol FROM user_profiles WHERE id = auth.uid();
$$;

-- LECTURA: todos los usuarios autenticados pueden leer
CREATE POLICY "Read authenticated" ON user_profiles    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Read authenticated" ON employees         FOR SELECT TO authenticated USING (true);
CREATE POLICY "Read authenticated" ON raw_materials     FOR SELECT TO authenticated USING (true);
CREATE POLICY "Read authenticated" ON cif_items         FOR SELECT TO authenticated USING (true);
CREATE POLICY "Read authenticated" ON app_config        FOR SELECT TO authenticated USING (true);
CREATE POLICY "Read authenticated" ON products_costing  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Read authenticated" ON recipes           FOR SELECT TO authenticated USING (true);
CREATE POLICY "Read authenticated" ON production_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Read authenticated" ON clients           FOR SELECT TO authenticated USING (true);
CREATE POLICY "Read authenticated" ON gallery_photos    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Read authenticated" ON attendance        FOR SELECT TO authenticated USING (true);
CREATE POLICY "Read authenticated" ON inventory_movements FOR SELECT TO authenticated USING (true);

-- ESCRITURA ADMIN: acceso total
CREATE POLICY "Admin write" ON user_profiles    FOR ALL TO authenticated USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "Admin write" ON employees         FOR ALL TO authenticated USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "Admin write" ON raw_materials     FOR ALL TO authenticated USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "Admin write" ON cif_items         FOR ALL TO authenticated USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "Admin write" ON app_config        FOR ALL TO authenticated USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "Admin write" ON products_costing  FOR ALL TO authenticated USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "Admin write" ON recipes           FOR ALL TO authenticated USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "Admin write" ON production_records FOR ALL TO authenticated USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "Admin write" ON clients           FOR ALL TO authenticated USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "Admin write" ON gallery_photos    FOR ALL TO authenticated USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "Admin write" ON attendance        FOR ALL TO authenticated USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "Admin write" ON inventory_movements FOR ALL TO authenticated USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');

-- ESCRITURA OPERARIO: producción, asistencia, galería, movimientos inventario
CREATE POLICY "Operario insert production" ON production_records FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('admin','operario'));
CREATE POLICY "Operario update production" ON production_records FOR UPDATE TO authenticated USING (get_my_role() IN ('admin','operario'));
CREATE POLICY "Operario insert attendance" ON attendance FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('admin','operario'));
CREATE POLICY "Operario update attendance" ON attendance FOR UPDATE TO authenticated USING (get_my_role() IN ('admin','operario'));
CREATE POLICY "Operario insert gallery"    ON gallery_photos FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('admin','operario'));
CREATE POLICY "Operario insert inventory"  ON inventory_movements FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('admin','operario'));
CREATE POLICY "Operario update rawmat"     ON raw_materials FOR UPDATE TO authenticated USING (get_my_role() IN ('admin','operario'));

-- ESCRITURA VENTAS: clientes
CREATE POLICY "Ventas insert clients" ON clients FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('admin','ventas'));
CREATE POLICY "Ventas update clients" ON clients FOR UPDATE TO authenticated USING (get_my_role() IN ('admin','ventas'));
CREATE POLICY "Ventas delete clients" ON clients FOR DELETE TO authenticated USING (get_my_role() IN ('admin','ventas'));

-- Self: usuario actualiza su propio último acceso
CREATE POLICY "Self update profile" ON user_profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- ============================================================
-- STORAGE BUCKETS (ejecutar por separado si falla)
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES
  ('production-photos', 'production-photos', false),
  ('gallery', 'gallery', false),
  ('recipe-images', 'recipe-images', false),
  ('technical-sheets', 'technical-sheets', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated upload production" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'production-photos');
CREATE POLICY "Authenticated read production"   ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'production-photos');
CREATE POLICY "Authenticated upload gallery"    ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'gallery');
CREATE POLICY "Authenticated read gallery"      ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'gallery');
CREATE POLICY "Authenticated upload recipes"    ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'recipe-images');
CREATE POLICY "Authenticated read recipes"      ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'recipe-images');
CREATE POLICY "Authenticated upload sheets"     ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'technical-sheets');
CREATE POLICY "Authenticated read sheets"       ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'technical-sheets');
