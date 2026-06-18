-- ============================================================
-- MUMI AMAZONIA — Migration v39 (Storage policies para el bucket 'documentos')
-- Permite a los usuarios autenticados subir/leer/editar/borrar archivos
-- en el bucket 'documentos' (logos, documentos del SGC, evidencias, etc.)
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- Requisito: el bucket 'documentos' ya debe existir (Storage → New bucket, Público).
-- ============================================================

DROP POLICY IF EXISTS documentos_obj_select ON storage.objects;
CREATE POLICY documentos_obj_select ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'documentos');

DROP POLICY IF EXISTS documentos_obj_insert ON storage.objects;
CREATE POLICY documentos_obj_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documentos');

DROP POLICY IF EXISTS documentos_obj_update ON storage.objects;
CREATE POLICY documentos_obj_update ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'documentos') WITH CHECK (bucket_id = 'documentos');

DROP POLICY IF EXISTS documentos_obj_delete ON storage.objects;
CREATE POLICY documentos_obj_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'documentos');

-- Lectura pública (para mostrar el logo en las impresiones sin sesión)
DROP POLICY IF EXISTS documentos_obj_public_read ON storage.objects;
CREATE POLICY documentos_obj_public_read ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'documentos');
