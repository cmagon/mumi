-- v93 — Vuelve PÚBLICOS los buckets de IMÁGENES de la app.
-- Al endurecer la seguridad quedaron privados, pero la app los muestra con URLs públicas
-- (getPublicUrl): un bucket privado responde "Bucket not found" y por eso las fotos de
-- productos "se suben pero no se ven". Las imágenes de productos/galería/producción no son
-- información sensible. Los buckets sensibles (documentos, technical-sheets) siguen privados.
update storage.buckets set public = true
where id in ('product-images', 'gallery', 'production-photos', 'recipe-images');
