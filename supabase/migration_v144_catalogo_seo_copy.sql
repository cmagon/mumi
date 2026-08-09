-- v144 — SEO por necesidad + marca subjetiva (Mumi con mayúscula)
-- Ejemplo: "Infusión Mumi para despertar tu energía"
-- Lenguaje prudente: acompaña / para quienes buscan (sin promesas médicas).

update config_catalogo set
  seo_titulo = 'Infusiones Mumi para energía, digestión y calma',
  seo_descripcion = 'Cuando el día pesa o el café ya no basta, las infusiones Mumi te acompañan: asaí, jamaica, cocona y arazá de la Amazonía. Ritual sin cafeína, sabor con origen Guaviare. Pide por WhatsApp.',
  seo_keywords = 'infusiones Mumi, Mumi Amazonía, infusión para la energía, infusión digestiva, té sin cafeína, flor de jamaica para qué sirve, limonaria digestiva, asaí antioxidante, bienestar natural colombia, aromáticas amazónicas',
  seo_indexar = coalesce(seo_indexar, true),
  categorias_orden = case
    when categorias_orden is null or cardinality(categorias_orden) = 0
    then array['Infusiones', 'Galletas', 'Dulces']::text[]
    else categorias_orden
  end
where id = 1;

-- Vitalidad / sin cafeína (asaí + jamaica)
update finished_products set
  catalogo_seo_titulo = 'Infusión Mumi para despertar tu energía',
  catalogo_seo_desc = 'Para días que piden vitalidad sin el nerviosismo del café. Infusión Mumi de asaí y flor de jamaica: apoyo antioxidante y un ritual que te reconecta. Caja x 12.'
where nombre = 'Infusión Asaí y Flor de Jamaica caja x12 Unid';

-- Rutina / impulso matutino (arazá + piña + cacao)
update finished_products set
  catalogo_seo_titulo = 'Infusión Mumi para arrancar tu mañana',
  catalogo_seo_desc = 'Si buscas un empujón natural al despertar, esta infusión Mumi une arazá rico en vitamina C, piña y cacao. Impulso tropical para acompañar tu rutina. Caja x 12.'
where nombre = 'Infusión Arazá, Piña y Cacao Caja x 12 Unid';

-- Digestión / pesadez
update finished_products set
  catalogo_seo_titulo = 'Infusión Mumi para aliviar la pesadez',
  catalogo_seo_desc = 'Para cuando el estómago pide calma. Infusión Mumi de cocona y limonaria: frescura cítrica que acompaña tu digestión después de comer. Caja x 12.'
where nombre = 'Infusión Cocona y Limonaria caja x 12 Unid';

-- Ritual a medida / granel antioxidante
update finished_products set
  catalogo_seo_titulo = 'Infusión Mumi a tu medida para el bienestar',
  catalogo_seo_desc = 'Prepara tu ritual como quieras. Infusión Mumi a granel (75g) con asaí, jamaica y limonaria: antioxidantes y calma, en la dosis que tú elijas.'
where nombre = 'Infusión Mumi a granel mezcla Asai, Flor de Jamaica y Limonaria x75 gramos';

-- Digestión continua / granel
update finished_products set
  catalogo_seo_titulo = 'Infusión Mumi para después de comer',
  catalogo_seo_desc = 'Cuando sientes hinchazón o pesadez, esta infusión Mumi a granel (75g) de cocona, piña y limonaria te acompaña ligera y cítrica, taza a taza.'
where nombre = 'Infusión Mumi a granel mezcla Cocona Piña y Limonaria x 75 gramos';

-- Snacks: antojo con sentido
update finished_products set
  catalogo_seo_titulo = 'Galleta Mumi de arazá para el antojo real',
  catalogo_seo_desc = 'Para el antojo que no quiere vacío. Galleta Mumi de arazá: crujiente, frutal y hecha con fruto del Guaviare. 40g de sabor con origen.'
where nombre = 'Galleta Mumi de Arazá x 40g';

update finished_products set
  catalogo_seo_titulo = 'Galleta Mumi de asaí para una pausa con sentido',
  catalogo_seo_desc = 'Cuando quieres picar sin perder el origen. Galleta Mumi de asaí silvestre: sabor profundo, artesanal, elaborada en Colombia. 40g.'
where nombre = 'Galleta Mumi de Asai x 40g';

update finished_products set
  catalogo_seo_titulo = 'Galleta Mumi de copoazú para un dulce suave',
  catalogo_seo_desc = 'Para quien busca dulzor sin empalagar. Galleta Mumi de copoazú amazónico: cremosa, delicada y con carácter de selva. 40g.'
where nombre = 'Galleta Mumi de Copoazú x 40g';

update finished_products set
  catalogo_seo_titulo = 'Bocadillos Mumi de arazá y cocona para compartir',
  catalogo_seo_desc = 'Para la mesa, el regalo o la oficina. Bocadillos Mumi de arazá y cocona (x20): sabor vivo que se comparte y conecta con el Guaviare.'
where nombre = 'Bocadillo Mumi Surt. Arazá - Cocona caja x 20 unid';

update finished_products set
  catalogo_seo_titulo = 'Bocadillos Mumi de arazá y seje para descubrir',
  catalogo_seo_desc = 'Para probar frutos que casi no ves en el súper. Bocadillos Mumi de arazá y seje (x20): diversidad amazónica en cada bocado.'
where nombre = 'Bocadillo Mumi Surt. Arazá - Seje caja x 20 unid';

update finished_products set
  catalogo_seo_titulo = 'Bocadillos Mumi de asaí y arazá para regalar',
  catalogo_seo_desc = 'Para regalar algo con historia. Bocadillos Mumi de asaí y arazá (x20): dulce artesanal con origen Guaviare y alma de selva.'
where nombre = 'Bocadillo Mumi Surt. Asaí - Arazá caja x 20 unid';

update finished_products set
  catalogo_seo_titulo = 'Bocadillos Mumi de asaí y cocona con contraste',
  catalogo_seo_desc = 'Para quien busca algo distinto al dulce común. Bocadillos Mumi de asaí intenso y cocona fresca (x20): contraste amazónico en caja.'
where nombre = 'Bocadillo Mumi Surt. Asaí - Cocona caja x 20 unid';

update finished_products set
  catalogo_seo_titulo = 'Bocadillos Mumi de asaí y seje para nutrir el antojo',
  catalogo_seo_desc = 'Para un snack con más sentido. Bocadillos Mumi de asaí y seje (x20): frutos nativos que alimentan y cuentan de dónde vienen.'
where nombre = 'Bocadillo Mumi Surt. Asaí - Seje caja x 20 unid';

update finished_products set
  catalogo_seo_titulo = 'Bocadillos Mumi de cocona y seje para equilibrar',
  catalogo_seo_desc = 'Para equilibrar antojo y frescura. Bocadillos Mumi de cocona chispeante y seje suave (x20): listos para compartir.'
where nombre = 'Bocadillo Mumi Surt. Cocona - Seje caja x 20 unid';
