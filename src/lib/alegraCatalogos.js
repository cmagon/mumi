// Unidades de medida aceptadas por Alegra (valor API → etiqueta en español)
export const UNIDADES_ALEGRA = [
  { v: 'unit', l: 'Unidad' },
  { v: 'unit', l: 'Caja (se factura como unidad)' },
  { v: 'kilogram', l: 'Kilogramo (Kg)' },
  { v: 'gram', l: 'Gramo (g)' },
  { v: 'pound', l: 'Libra' },
  { v: 'liter', l: 'Litro' },
  { v: 'mililiter', l: 'Mililitro (ml)' },
  { v: 'gallon', l: 'Galón' },
  { v: 'piece', l: 'Pieza' },
  { v: 'meter', l: 'Metro' },
  { v: 'service', l: 'Servicio' },
  { v: 'notApplicable', l: 'No aplica' },
]

// Catálogo UNSPSC del SEGMENTO 50 (Alimentos, bebidas y tabaco) a nivel PRODUCTO (commodity).
// IMPORTANTE: la DIAN/Alegra rechaza los códigos terminados en "00" (son encabezados de clase o
// familia, no productos). Por eso aquí SOLO van códigos específicos de 8 dígitos. El campo
// `grupo` permite agruparlos en el selector. Si necesitas un código de otro segmento, puedes
// escribirlo a mano.
//
// FUENTE: verificado código por código contra el archivo oficial descargado directamente de
// Colombia Compra Eficiente — "Clasificador de bienes y servicios v14.1" (traducción oficial al
// castellano del UNSPSC), disponible en
// https://operaciones.colombiacompra.gov.co/clasificador-de-bienes-y-servicios
// El campo `desc` reproduce el "Nombre Producto" oficial de esa fuente (a veces muy escueto,
// ej. "Conserva"); cualquier aclaración adicional va después del guion largo y NO es parte del
// nombre oficial. Aun así, antes de facturar con un código nuevo confírmalo en
// https://www.colombiacompra.gov.co/secop/consulta-codigo-unspsc
export const UNSPSC_ALIMENTOS = [
  // ── Panadería y galletas (5018) ──
  { codigo: '50181905', desc: 'Galletas de dulce', grupo: 'Panadería y galletas' },
  { codigo: '50181903', desc: 'Galletas sencillas de sal', grupo: 'Panadería y galletas' },
  { codigo: '50181909', desc: 'Galletas de soda', grupo: 'Panadería y galletas' },
  { codigo: '50182005', desc: 'Galletas de arroz', grupo: 'Panadería y galletas' },
  { codigo: '50181901', desc: 'Pan fresco', grupo: 'Panadería y galletas' },
  { codigo: '50181902', desc: 'Pan congelado', grupo: 'Panadería y galletas' },
  { codigo: '50181904', desc: 'Pan seco o cascaras de pan o pan tostado (crotones)', grupo: 'Panadería y galletas' },
  { codigo: '50181906', desc: 'Pan de repisa', grupo: 'Panadería y galletas' },
  { codigo: '50182001', desc: 'Ponqués pasteles o biscochos frescos', grupo: 'Panadería y galletas' },
  { codigo: '50182002', desc: 'Ponqués pasteles o biscochos congelados', grupo: 'Panadería y galletas' },
  { codigo: '50181708', desc: 'Mezclas para hornear', grupo: 'Panadería y galletas' },
  { codigo: '50181709', desc: 'Suministros para hornear', grupo: 'Panadería y galletas' },

  // ── Chocolate, azúcar y confitería (5016) ──
  { codigo: '50161814', desc: 'Azúcar o sustituto de azúcar, confite', grupo: 'Confitería y chocolate' },
  { codigo: '50161813', desc: 'Chocolate o sustituto de chocolate, confite', grupo: 'Confitería y chocolate' },
  { codigo: '50161511', desc: 'Chocolate o sustituto de chocolate', grupo: 'Confitería y chocolate' },
  { codigo: '50161815', desc: 'Goma de mascar', grupo: 'Confitería y chocolate' },
  { codigo: '50161509', desc: 'Azucares naturales o productos endulzantes', grupo: 'Confitería y chocolate' },
  { codigo: '50161510', desc: 'Endulzantes artificiales', grupo: 'Confitería y chocolate' },
  { codigo: '50161512', desc: 'Almíbar', grupo: 'Confitería y chocolate' },

  // ── Conservas, mermeladas, miel y untables (5017 / 5019) ──
  { codigo: '50171904', desc: 'Conserva', grupo: 'Conservas y untables' },
  { codigo: '50192401', desc: 'Mermeladas o preservativos de fruta', grupo: 'Conservas y untables' },
  { codigo: '50192403', desc: 'Miel', grupo: 'Conservas y untables' },
  { codigo: '50192402', desc: 'Mantequilla de nueces o mixto', grupo: 'Conservas y untables' },
  { codigo: '50171901', desc: 'Encurtidos', grupo: 'Conservas y untables' },
  { codigo: '50171830', desc: 'Salsas o condimentos o cremas de untar o marinados', grupo: 'Conservas y untables' },
  { codigo: '50171832', desc: 'Salsas para ensaladas o dips', grupo: 'Conservas y untables' },
  { codigo: '50171707', desc: 'Vinagres', grupo: 'Conservas y untables' },
  { codigo: '50171550', desc: 'Especies o extractos', grupo: 'Conservas y untables' },
  { codigo: '50171553', desc: 'Polvo de pimentón rojo', grupo: 'Conservas y untables' },

  // ── Té, café e infusiones / aromáticas (5020 / 5017) ──
  { codigo: '50201715', desc: 'Té de frutas', grupo: 'Té, café e infusiones' },
  { codigo: '50201710', desc: 'Té de hoja', grupo: 'Té, café e infusiones' },
  { codigo: '50201711', desc: 'Té instantáneo', grupo: 'Té, café e infusiones' },
  { codigo: '50201712', desc: 'Bebidas de té', grupo: 'Té, café e infusiones' },
  { codigo: '50201713', desc: 'Bolsas de té', grupo: 'Té, café e infusiones' },
  { codigo: '50201706', desc: 'Café', grupo: 'Té, café e infusiones' },
  { codigo: '50201708', desc: 'Bebida de café', grupo: 'Té, café e infusiones' },
  { codigo: '50201709', desc: 'Café instantáneo', grupo: 'Té, café e infusiones' },
  { codigo: '50171554', desc: 'Tallo de hierbas y semillas para infusiones', grupo: 'Té, café e infusiones' },
  { codigo: '50171548', desc: 'Hierbas frescas', grupo: 'Té, café e infusiones' },

  // ── Pulpas y frutas procesadas (5030 / 5020 / 5017) ──
  // 50307503 "Pulpa" es el código GENÉRICO oficial para pulpa de fruta (cualquier fruta), dentro
  // de la clase "Subproductos de frutas frescas" — confirmado en el archivo oficial de Colombia
  // Compra Eficiente. Los demás son alternativas según cómo se procese/presente el producto.
  { codigo: '50307503', desc: 'Pulpa', grupo: 'Pulpas y frutas procesadas', alias: ['pulpa', 'pulpas'] },
  { codigo: '50202305', desc: 'Jugo fresco', grupo: 'Pulpas y frutas procesadas', alias: ['pulpa', 'pulpas'] },
  { codigo: '50202803', desc: 'Concentrado de mango', grupo: 'Pulpas y frutas procesadas', alias: ['pulpa', 'pulpas'] },
  { codigo: '50202804', desc: 'Concentrado de maracuyá', grupo: 'Pulpas y frutas procesadas', alias: ['pulpa', 'pulpas'] },
  { codigo: '50202805', desc: 'Concentrado de piña', grupo: 'Pulpas y frutas procesadas', alias: ['pulpa', 'pulpas'] },
  { codigo: '50171904', desc: 'Conserva — aplica a bocadillo/dulce de fruta', grupo: 'Pulpas y frutas procesadas', alias: ['pulpa', 'pulpas', 'bocadillo'] },

  // ── Frutas amazónicas y exóticas — FRUTA FRESCA sin procesar (5030) ──
  // Si vendes la fruta entera/fresca (no la pulpa ya procesada), usa el código de la fruta
  // específica. Para el producto procesado (pulpa, bocadillo, etc.) usa el grupo de arriba.
  { codigo: '50307041', desc: 'Copoazu', grupo: 'Frutas amazónicas (fruta fresca)' },
  { codigo: '50307040', desc: 'Araza', grupo: 'Frutas amazónicas (fruta fresca)' },
  { codigo: '50307038', desc: 'Camu camu', grupo: 'Frutas amazónicas (fruta fresca)' },
  { codigo: '50307044', desc: 'Cocona', grupo: 'Frutas amazónicas (fruta fresca)' },
  { codigo: '50307043', desc: 'Aguaje', grupo: 'Frutas amazónicas (fruta fresca)' },
  { codigo: '50307035', desc: 'Guanabana', grupo: 'Frutas amazónicas (fruta fresca)' },
  { codigo: '50307045', desc: 'Guayaba', grupo: 'Frutas amazónicas (fruta fresca)' },
  { codigo: '50307037', desc: 'Tamarindo', grupo: 'Frutas amazónicas (fruta fresca)' },
  { codigo: '50307046', desc: 'Carambola', grupo: 'Frutas amazónicas (fruta fresca)' },
  { codigo: '50307020', desc: 'Mangostinos', grupo: 'Frutas amazónicas (fruta fresca)' },
  { codigo: '50307012', desc: 'Feijoa', grupo: 'Frutas amazónicas (fruta fresca)' },
  { codigo: '50307039', desc: 'Lúcuma', grupo: 'Frutas amazónicas (fruta fresca)' },
  { codigo: '50307008', desc: 'Coco', grupo: 'Frutas amazónicas (fruta fresca)' },
  // NOTA: "Seje", "Borojó" y "Açaí" NO existen como código individual en el clasificador oficial
  // v14.1 (se verificó específicamente) — para esas fichas, usa "Pulpa" (50307503) si vendes el
  // producto procesado, o pide a tu contador el código más cercano si necesitas la fruta fresca.

  // ── Jugos y bebidas no alcohólicas (5020) ──
  { codigo: '50202304', desc: 'Jugos de repisa', grupo: 'Jugos y bebidas' },
  { codigo: '50202303', desc: 'Jugos congelados', grupo: 'Jugos y bebidas' },
  { codigo: '50202306', desc: 'Refrescos', grupo: 'Jugos y bebidas' },
  { codigo: '50202307', desc: 'Bebida de chocolate o malta u otros', grupo: 'Jugos y bebidas' },
  { codigo: '50202309', desc: 'Bebidas deportivas o de energía', grupo: 'Jugos y bebidas' },
  { codigo: '50202311', desc: 'Bebida mixta de polvo', grupo: 'Jugos y bebidas' },
  { codigo: '50202301', desc: 'Agua', grupo: 'Jugos y bebidas' },
  { codigo: '50202310', desc: 'Agua mineral', grupo: 'Jugos y bebidas' },

  // ── Snacks, frutos secos y preparados (5019) ──
  { codigo: '50192110', desc: 'Nueces o fruta disecada', grupo: 'Snacks y preparados' },
  { codigo: '50192109', desc: 'Papas fritas de talego o mezclas', grupo: 'Snacks y preparados' },
  { codigo: '50192112', desc: 'Maíz pira', grupo: 'Snacks y preparados' },
  { codigo: '50192111', desc: 'Carne seca o procesada', grupo: 'Snacks y preparados' },
  { codigo: '50192303', desc: 'Helado de sabor o helado o postre de helado o yogurt congelado', grupo: 'Snacks y preparados' },
  { codigo: '50192304', desc: 'Conos o copas de helado comestibles', grupo: 'Snacks y preparados' },
  { codigo: '50192301', desc: 'Postres preparados', grupo: 'Snacks y preparados' },

  // ── Cereales, harinas y barras (5022) ──
  { codigo: '50221201', desc: 'Listo para comer o cereal caliente', grupo: 'Cereales y harinas' },
  { codigo: '50221202', desc: 'Barras de desayuno o de salud', grupo: 'Cereales y harinas' },
  { codigo: '50221101', desc: 'Grano de cereal', grupo: 'Cereales y harinas' },
  { codigo: '50221002', desc: 'Harina', grupo: 'Cereales y harinas' },
  { codigo: '50221303', desc: 'Almidón o harina comestible', grupo: 'Cereales y harinas' },
  { codigo: '50221302', desc: 'Malta de cebada', grupo: 'Cereales y harinas' },

  // ── Aceites y grasas (5015) ──
  { codigo: '50151513', desc: 'Aceites vegetales o de planta comestibles', grupo: 'Aceites y grasas' },
  { codigo: '50151604', desc: 'Aceites animal comestibles', grupo: 'Aceites y grasas' },
  { codigo: '50151515', desc: 'Leche de soya', grupo: 'Aceites y grasas' },

  // ── Jugos por fruta (5020) ──
  { codigo: '50202409', desc: 'Jugo de naranja', grupo: 'Jugos y bebidas' },
  { codigo: '50202601', desc: 'Jugo de manzana', grupo: 'Jugos y bebidas' },
  { codigo: '50202602', desc: 'Jugo de pera', grupo: 'Jugos y bebidas' },
  { codigo: '50202512', desc: 'Jugo de fresa', grupo: 'Jugos y bebidas' },
  { codigo: '50202513', desc: 'Jugo de uva', grupo: 'Jugos y bebidas' },
  { codigo: '50202509', desc: 'Jugo de mora', grupo: 'Jugos y bebidas' },
  { codigo: '50202404', desc: 'Jugo de limón', grupo: 'Jugos y bebidas' },

  // ── Comidas preparadas (5019) ──
  { codigo: '50192701', desc: 'Comidas combinadas frescas', grupo: 'Comidas preparadas' },
  { codigo: '50192702', desc: 'Comidas combinadas congeladas', grupo: 'Comidas preparadas' },
  { codigo: '50192501', desc: 'Emparedados frescos', grupo: 'Comidas preparadas' },
  { codigo: '50192502', desc: 'Emparedados congelados', grupo: 'Comidas preparadas' },
  { codigo: '50192801', desc: 'Pasteles de sal frescos', grupo: 'Comidas preparadas' },
  { codigo: '50192802', desc: 'Pasteles de sal congelados', grupo: 'Comidas preparadas' },
  { codigo: '50191505', desc: 'Sopas o sudados preparados fresco', grupo: 'Comidas preparadas' },
  { codigo: '50193201', desc: 'Ensalada fresca preparada', grupo: 'Comidas preparadas' },
  { codigo: '50192901', desc: 'Pasta sencilla o fideos', grupo: 'Comidas preparadas' },

  // ── Condimentos y básicos (5017 / 5022) ──
  { codigo: '50171831', desc: 'Salsas para cocinar', grupo: 'Condimentos y básicos' },
  { codigo: '50171552', desc: 'Mezcla para adobar', grupo: 'Condimentos y básicos' },
  { codigo: '50171551', desc: 'Sal de mesa', grupo: 'Condimentos y básicos' },
  { codigo: '50221301', desc: 'Harina vegetal', grupo: 'Condimentos y básicos' },
  { codigo: '50221304', desc: 'Harina de papa', grupo: 'Condimentos y básicos' },
  { codigo: '50221102', desc: 'Grano de harina', grupo: 'Condimentos y básicos' },
]
