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
// familia, no productos). Por eso aquí SOLO van códigos específicos de 8 dígitos válidos para
// facturar. El campo `grupo` permite agruparlos en el selector. Si necesitas un código de otro
// segmento, puedes escribirlo a mano.
export const UNSPSC_ALIMENTOS = [
  // ── Panadería y galletas (5018) ──
  { codigo: '50181905', desc: 'Galletas dulces', grupo: 'Panadería y galletas' },
  { codigo: '50181903', desc: 'Galletas sencillas de sal', grupo: 'Panadería y galletas' },
  { codigo: '50181909', desc: 'Galletas de soda (saladas horneadas)', grupo: 'Panadería y galletas' },
  { codigo: '50182005', desc: 'Galletas de arroz', grupo: 'Panadería y galletas' },
  { codigo: '50181901', desc: 'Pan fresco', grupo: 'Panadería y galletas' },
  { codigo: '50181902', desc: 'Pan congelado (precocido)', grupo: 'Panadería y galletas' },
  { codigo: '50181904', desc: 'Pan seco / tostado', grupo: 'Panadería y galletas' },
  { codigo: '50181906', desc: 'Pan de repisa (empacado)', grupo: 'Panadería y galletas' },
  { codigo: '50182001', desc: 'Ponqués, pasteles o bizcochos frescos', grupo: 'Panadería y galletas' },
  { codigo: '50182002', desc: 'Ponqués, pasteles o bizcochos congelados', grupo: 'Panadería y galletas' },
  { codigo: '50181708', desc: 'Mezclas para hornear', grupo: 'Panadería y galletas' },
  { codigo: '50181709', desc: 'Suministros para hornear', grupo: 'Panadería y galletas' },

  // ── Chocolate, azúcar y confitería (5016) ──
  { codigo: '50161814', desc: 'Confite de azúcar (gomitas, dulces, bocadillos)', grupo: 'Confitería y chocolate' },
  { codigo: '50161813', desc: 'Confite de chocolate', grupo: 'Confitería y chocolate' },
  { codigo: '50161811', desc: 'Confite (dulces en general)', grupo: 'Confitería y chocolate' },
  { codigo: '50161511', desc: 'Chocolate o sustituto de chocolate', grupo: 'Confitería y chocolate' },
  { codigo: '50161815', desc: 'Goma de mascar', grupo: 'Confitería y chocolate' },
  { codigo: '50161509', desc: 'Azúcares naturales o endulzantes', grupo: 'Confitería y chocolate' },
  { codigo: '50161510', desc: 'Endulzantes artificiales', grupo: 'Confitería y chocolate' },
  { codigo: '50161512', desc: 'Almíbar / jarabe', grupo: 'Confitería y chocolate' },

  // ── Conservas, mermeladas, miel y untables (5017 / 5019) ──
  { codigo: '50171904', desc: 'Conservas de frutas (bocadillo, dulces de fruta)', grupo: 'Conservas y untables' },
  { codigo: '50192401', desc: 'Mermeladas o conservas de fruta', grupo: 'Conservas y untables' },
  { codigo: '50192403', desc: 'Miel', grupo: 'Conservas y untables' },
  { codigo: '50192402', desc: 'Mantequilla de nueces (maní, etc.)', grupo: 'Conservas y untables' },
  { codigo: '50171901', desc: 'Encurtidos', grupo: 'Conservas y untables' },
  { codigo: '50171830', desc: 'Salsas, condimentos o cremas de untar', grupo: 'Conservas y untables' },
  { codigo: '50171832', desc: 'Salsas para ensaladas o dips', grupo: 'Conservas y untables' },
  { codigo: '50171707', desc: 'Vinagres', grupo: 'Conservas y untables' },
  { codigo: '50171550', desc: 'Especias o extractos', grupo: 'Conservas y untables' },
  { codigo: '50171553', desc: 'Pimentón / ají en polvo', grupo: 'Conservas y untables' },

  // ── Té, café e infusiones / aromáticas (5020 / 5017) ──
  { codigo: '50201715', desc: 'Té de frutas (infusiones de fruta)', grupo: 'Té, café e infusiones' },
  { codigo: '50201710', desc: 'Té de hoja', grupo: 'Té, café e infusiones' },
  { codigo: '50201711', desc: 'Té instantáneo', grupo: 'Té, café e infusiones' },
  { codigo: '50201712', desc: 'Bebidas de té (listas para beber)', grupo: 'Té, café e infusiones' },
  { codigo: '50201713', desc: 'Bolsas de té (sobres / filtros)', grupo: 'Té, café e infusiones' },
  { codigo: '50201706', desc: 'Café molido', grupo: 'Té, café e infusiones' },
  { codigo: '50201708', desc: 'Bebida de café', grupo: 'Té, café e infusiones' },
  { codigo: '50201709', desc: 'Café instantáneo (soluble)', grupo: 'Té, café e infusiones' },
  { codigo: '50171554', desc: 'Hierbas y semillas para infusiones (aromáticas)', grupo: 'Té, café e infusiones' },
  { codigo: '50171548', desc: 'Hierbas frescas', grupo: 'Té, café e infusiones' },

  // ── Jugos y bebidas no alcohólicas (5020) ──
  { codigo: '50202305', desc: 'Jugo fresco (zumo de frutas)', grupo: 'Jugos y bebidas' },
  { codigo: '50202304', desc: 'Jugos de repisa (empacados)', grupo: 'Jugos y bebidas' },
  { codigo: '50202303', desc: 'Jugos congelados', grupo: 'Jugos y bebidas' },
  { codigo: '50202306', desc: 'Refrescos', grupo: 'Jugos y bebidas' },
  { codigo: '50202307', desc: 'Bebida de chocolate o malta', grupo: 'Jugos y bebidas' },
  { codigo: '50202309', desc: 'Bebidas deportivas o energéticas', grupo: 'Jugos y bebidas' },
  { codigo: '50202311', desc: 'Bebida en polvo / concentrados y jarabes', grupo: 'Jugos y bebidas' },
  { codigo: '50202301', desc: 'Agua embotellada', grupo: 'Jugos y bebidas' },
  { codigo: '50202310', desc: 'Agua mineral', grupo: 'Jugos y bebidas' },
  { codigo: '50202805', desc: 'Concentrado de piña', grupo: 'Jugos y bebidas' },
  { codigo: '50202803', desc: 'Concentrado de mango', grupo: 'Jugos y bebidas' },
  { codigo: '50202804', desc: 'Concentrado de maracuyá', grupo: 'Jugos y bebidas' },

  // ── Snacks, frutos secos y preparados (5019) ──
  { codigo: '50192110', desc: 'Nueces o fruta disecada (deshidratada)', grupo: 'Snacks y preparados' },
  { codigo: '50192109', desc: 'Papas fritas / pasabocas de paquete', grupo: 'Snacks y preparados' },
  { codigo: '50192112', desc: 'Maíz pira (palomitas)', grupo: 'Snacks y preparados' },
  { codigo: '50192111', desc: 'Carne seca o procesada', grupo: 'Snacks y preparados' },
  { codigo: '50192303', desc: 'Helado o postre de helado', grupo: 'Snacks y preparados' },
  { codigo: '50192304', desc: 'Conos o copas de helado comestibles', grupo: 'Snacks y preparados' },
  { codigo: '50192301', desc: 'Postres preparados', grupo: 'Snacks y preparados' },

  // ── Cereales, harinas y barras (5022) ──
  { codigo: '50221201', desc: 'Cereal listo para comer', grupo: 'Cereales y harinas' },
  { codigo: '50221202', desc: 'Barras de desayuno o de salud (cereal/nueces)', grupo: 'Cereales y harinas' },
  { codigo: '50221101', desc: 'Grano de cereal (arroz, integral)', grupo: 'Cereales y harinas' },
  { codigo: '50221002', desc: 'Harina', grupo: 'Cereales y harinas' },
  { codigo: '50221303', desc: 'Almidón o fécula (maicena)', grupo: 'Cereales y harinas' },
  { codigo: '50221302', desc: 'Malta de cebada', grupo: 'Cereales y harinas' },

  // ── Aceites y grasas (5015) ──
  { codigo: '50151513', desc: 'Aceites vegetales comestibles', grupo: 'Aceites y grasas' },
  { codigo: '50151604', desc: 'Aceites animales comestibles', grupo: 'Aceites y grasas' },
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
  { codigo: '50192801', desc: 'Empanadas / pasteles de sal frescos', grupo: 'Comidas preparadas' },
  { codigo: '50192802', desc: 'Empanadas / pasteles de sal congelados', grupo: 'Comidas preparadas' },
  { codigo: '50191505', desc: 'Sopas o sudados preparados frescos', grupo: 'Comidas preparadas' },
  { codigo: '50193201', desc: 'Ensalada fresca preparada', grupo: 'Comidas preparadas' },
  { codigo: '50192901', desc: 'Pasta sencilla o fideos', grupo: 'Comidas preparadas' },

  // ── Condimentos y básicos (5017 / 5022) ──
  { codigo: '50171831', desc: 'Salsas para cocinar', grupo: 'Condimentos y básicos' },
  { codigo: '50171552', desc: 'Mezcla para adobar', grupo: 'Condimentos y básicos' },
  { codigo: '50171551', desc: 'Sal de mesa', grupo: 'Condimentos y básicos' },
  { codigo: '50221301', desc: 'Harina vegetal / pasta de sémola', grupo: 'Condimentos y básicos' },
  { codigo: '50221304', desc: 'Harina de papa', grupo: 'Condimentos y básicos' },
  { codigo: '50221102', desc: 'Grano de harina', grupo: 'Condimentos y básicos' },
]
