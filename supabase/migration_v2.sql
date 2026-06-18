-- ============================================================
-- MUMI AMAZONIA — Migration v2 (idempotente / segura de re-ejecutar)
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1) COLUMNAS NUEVAS EN products_costing  ← ESTO ES LO CRÍTICO PARA PODER GUARDAR
ALTER TABLE products_costing
  ADD COLUMN IF NOT EXISTS imagen_url   TEXT    DEFAULT '',
  ADD COLUMN IF NOT EXISTS rendimiento  NUMERIC DEFAULT 62,
  ADD COLUMN IF NOT EXISTS desperdicio  NUMERIC DEFAULT 2,
  ADD COLUMN IF NOT EXISTS peso_unidad  NUMERIC DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS brix         NUMERIC DEFAULT 75,
  ADD COLUMN IF NOT EXISTS brix_aplica  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ficha_nombre TEXT    DEFAULT '',
  ADD COLUMN IF NOT EXISTS ficha_url    TEXT    DEFAULT '';

-- 2) Bucket de imágenes de producto (no falla si ya existe)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('product-images', 'product-images', false)
ON CONFLICT (id) DO NOTHING;

-- 3) Políticas del bucket (DROP + CREATE para evitar "policy already exists")
DROP POLICY IF EXISTS "Auth read product-images"   ON storage.objects;
DROP POLICY IF EXISTS "Auth upload product-images" ON storage.objects;
CREATE POLICY "Auth read product-images"   ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'product-images');
CREATE POLICY "Auth upload product-images" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images');

-- 4) Verificación: debe listar las 8 columnas nuevas
SELECT column_name FROM information_schema.columns
WHERE table_name = 'products_costing'
  AND column_name IN ('imagen_url','rendimiento','desperdicio','peso_unidad','brix','brix_aplica','ficha_nombre','ficha_url')
ORDER BY column_name;
