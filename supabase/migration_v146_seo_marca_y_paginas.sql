-- v146 — SEO de marca (menos enfocado solo a infusiones) + SEO por página fija
-- seo_paginas: { nosotros: { titulo, desc }, contacto: {...}, galeria: {...}, tienda: {...} }

alter table config_catalogo
  add column if not exists seo_paginas jsonb default '{}'::jsonb;

-- Ampliar copy del sitio si aún apunta solo a infusiones (migración v144)
update config_catalogo set
  seo_titulo = 'Mumi Amazonia — Productos naturales de la selva del Guaviare',
  seo_descripcion = 'Catálogo de productos amazónicos: alimentos, snacks, bebidas e ingredientes del Guaviare. Origen sostenible y pedidos por WhatsApp en Colombia.',
  seo_keywords = 'Mumi Amazonia, productos amazónicos, Guaviare, alimentos naturales, snacks amazónicos, bebidas naturales, frutas amazónicas, compra por WhatsApp Colombia',
  seo_paginas = coalesce(seo_paginas, '{}'::jsonb) || jsonb_build_object(
    'nosotros', jsonb_build_object(
      'titulo', 'Nosotros',
      'desc', 'Conoce a Mumi Amazonia: productos con origen en la selva del Guaviare, elaborados con frutos nativos y compromiso con las comunidades.'
    ),
    'contacto', jsonb_build_object(
      'titulo', 'Contacto',
      'desc', 'Escríbenos por WhatsApp o formulario. Pedidos, mayoristas y alianzas con Mumi Amazonia.'
    ),
    'galeria', jsonb_build_object(
      'titulo', 'Galería',
      'desc', 'Fotos y videos de productos, frutos y el origen amazónico de Mumi Amazonia.'
    )
  )
where id = 1
  and (
    seo_titulo ilike '%infusi%'
    or seo_descripcion ilike '%infusi%'
    or seo_keywords ilike '%infusi%'
    or seo_titulo is null
    or seo_descripcion is null
  );
