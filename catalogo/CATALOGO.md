# MUMI AMAZONIA — Catálogo Digital Público

## Archivo de contexto para Claude Code

---

## 🎯 Propósito de este archivo

Este documento describe el diseño, arquitectura y lógica del catálogo público de Mumi Amazonia. Debe leerse junto con PROYECTO.md antes de implementar cualquier código.

---

## 🏗️ Arquitectura

### Relación con el sistema principal

- El catálogo es un **segundo Cloudflare Worker** en el mismo repositorio  
- **Sin autenticación** — acceso público  
- **Solo lectura** de Supabase (excepto registro de visitas y pedidos)  
- Toda la administración vive en el Worker principal (`app.mumiamazonia.workers.dev`)  
- El catálogo se despliega en URL separada: `catalogo.mumiamazonia.workers.dev` (o dominio propio cuando esté disponible: `mumi.co` o `catalogo.mumiamazonia.com`)

### Flujo de datos

Worker principal (admin)

  → escribe en Supabase: productos, precios, config, plantilla activa

        ↓

   Supabase (fuente de verdad)

        ↓

Worker catálogo (público)

  → lee productos donde visible \= true

  → lee config\_catalogo (plantilla, colores, textos)

  → escribe visitas y pedidos\_iniciados

---

## 🗄️ Tablas Supabase necesarias

\-- Productos visibles en el catálogo

CREATE TABLE productos\_catalogo (

  id           uuid PRIMARY KEY DEFAULT gen\_random\_uuid(),

  nombre       text NOT NULL,

  descripcion  text,

  categoria    text, \-- 'infusion' | 'galleta' | 'confite' | 'granel'

  precio\_detal integer NOT NULL,

  precio\_mayor integer,

  imagen\_url   text,

  beneficios   text\[\], \-- \['Antioxidantes', 'Vitamina C', ...\]

  fruto        text,   \-- 'asai' | 'araza' | 'cocona' | 'seje' | 'copoazu'

  stock        integer DEFAULT 0,

  visible      boolean DEFAULT true,

  destacado    boolean DEFAULT false, \-- aparece en hero card

  orden        integer DEFAULT 0,     \-- orden de aparición

  created\_at   timestamptz DEFAULT now(),

  updated\_at   timestamptz DEFAULT now()

);

\-- Configuración visual del catálogo (una sola fila)

CREATE TABLE config\_catalogo (

  id             integer PRIMARY KEY DEFAULT 1,

  plantilla      text DEFAULT 'amazonia', \-- 'amazonia' | 'natural' | 'noche'

  color\_primario text DEFAULT '\#1a3a2a',

  color\_acento   text DEFAULT '\#C8A94A',

  tipografia     text DEFAULT 'playfair', \-- 'playfair' | 'sans' | 'clasica'

  whatsapp       text DEFAULT '+573157702180',

  pedido\_minimo  integer DEFAULT 30000,

  mostrar\_mayor  boolean DEFAULT false,

  titulo\_banner  text DEFAULT 'Sabores de la selva',

  subtitulo      text DEFAULT 'Infusiones, galletas y dulces amazónicos',

  updated\_at     timestamptz DEFAULT now()

);

\-- Registro de visitas para métricas

CREATE TABLE visitas\_catalogo (

  id         bigserial PRIMARY KEY,

  fecha      date DEFAULT current\_date,

  hora       time DEFAULT current\_time,

  producto   text, \-- producto visto (null si es home)

  dispositivo text, \-- 'mobile' | 'tablet' | 'desktop'

  ciudad     text,

  referrer   text

);

\-- Pedidos iniciados por WhatsApp

CREATE TABLE pedidos\_catalogo (

  id          bigserial PRIMARY KEY,

  created\_at  timestamptz DEFAULT now(),

  productos   jsonb, \-- \[{nombre, cantidad, precio}\]

  total       integer,

  nota        text,

  estado      text DEFAULT 'iniciado' \-- 'iniciado' | 'confirmado' | 'entregado'

);

\-- RLS: catálogo solo puede leer productos y config, escribir visitas/pedidos

ALTER TABLE productos\_catalogo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalogo\_read" ON productos\_catalogo FOR SELECT USING (visible \= true);

ALTER TABLE config\_catalogo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalogo\_read" ON config\_catalogo FOR SELECT USING (true);

ALTER TABLE visitas\_catalogo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalogo\_insert" ON visitas\_catalogo FOR INSERT WITH CHECK (true);

ALTER TABLE pedidos\_catalogo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalogo\_insert" ON pedidos\_catalogo FOR INSERT WITH CHECK (true);

---

## 🎨 Diseño Visual

### Identidad Mumi Amazonia

/\* Paleta principal \*/

\--selva:        \#1a3a2a;   /\* fondo header, sidebar, botones primarios \*/

\--selva-medio:  \#2d5a3d;   /\* hover, cards oscuras \*/

\--crema:        \#F5F0E8;   /\* fondo principal de la app \*/

\--crema-oscuro: \#e8e0d0;   /\* bordes, separadores \*/

\--lima:         \#7CB342;   /\* badges, éxito, íconos secundarios \*/

\--dorado:       \#C8A94A;   /\* acento premium, precios, highlights \*/

\--tierra:       \#8B5E3C;   /\* precios, texto secundario cálido \*/

/\* WhatsApp \*/

\--wa-green: \#25D366;

### Tipografía

- Títulos / nombre de marca: **Playfair Display** (serif, elegante)  
- Cuerpo / precios / UI: **Source Sans 3** (sans-serif, legible)  
- Importar desde Google Fonts en el HTML del catálogo

### Plantillas disponibles

| Nombre | Fondo | Color primario | Acento | Mood |
| :---- | :---- | :---- | :---- | :---- |
| Amazonia (default) | \#F5F0E8 crema | \#1a3a2a selva | \#C8A94A dorado | Orgánico premium |
| Natural claro | \#ffffff blanco | \#2d5a3d selva medio | \#7CB342 lima | Fresco natural |
| Noche selva | \#0d1f1a oscuro | \#7CB342 lima | \#C8A94A dorado | Nocturno premium |

---

## 📱 Estructura de Pantallas

### 1\. Pantalla de inicio (Home)

┌─────────────────────────────┐

│  🌿 Mumi Amazonia           │  ← header verde selva

│  Sabores de la selva        │

├─────────────────────────────┤

│ \[Todos\]\[Infusiones\]\[Galletas│  ← chips categoría (scroll horizontal)

│  \]\[Confites\]\[A granel\]      │

├─────────────────────────────┤

│  ┌──────────────────────┐   │

│  │ 🫐 PRODUCTO DESTACADO │   │  ← hero card (producto con destacado=true)

│  │ Infusión Açaí        │   │

│  │ $25.000 · Caja x 12  │   │

│  └──────────────────────┘   │

├─────────────────────────────┤

│  Infusiones amazónicas  →   │

│  \[🫐 card\]\[🍵 card\]\[🍋 card\]│  ← scroll horizontal por categoría

├─────────────────────────────┤

│  Galletas amazónicas    →   │

│  \[🍪\]\[🍪\]\[🍪\]              │

├─────────────────────────────┤

│  Los frutos que nos inspiran│

│  \[🫐 Açaí\]\[🟡 Arazá\]\[...\]  │  ← chips informativos de frutos

├─────────────────────────────┤

│ 🛒 Ver pedido    $47.000    │  ← barra carrito flotante

├─────────────────────────────┤

│ 💬 Pedir por WhatsApp       │  ← botón WhatsApp

├─────────────────────────────┤

│ \[🏠\]\[🔍\]\[🛒\]\[🌿\]           │  ← nav inferior

└─────────────────────────────┘

### 2\. Detalle de producto

┌─────────────────────────────┐

│ ← 🫐                    ♡  │  ← header con emoji/imagen del producto

├─────────────────────────────┤

│ Infusión amazónica          │  ← categoría (pequeño, verde)

│ Infusión de Açaí &          │  ← nombre (Playfair Display)

│ Flor de Jamaica             │

│ $25.000 · Caja x 12 und    │  ← precio (tierra color)

├─────────────────────────────┤

│ Descripción completa del    │  ← texto del catálogo PDF

│ producto...                 │

├─────────────────────────────┤

│ \[Antioxidantes\]\[Vitamina C\] │  ← chips de beneficios (verde claro)

│ \[Salud cardiovascular\]      │

├─────────────────────────────┤

│ Cantidad    \[−\]\[  1  \]\[+\]  │  ← selector cantidad

├─────────────────────────────┤

│ 🛒 Agregar al pedido        │  ← botón primario (selva)

│ 💬 Pedir este producto WA   │  ← botón secundario (wa-green)

└─────────────────────────────┘

### 3\. Carrito / Resumen de pedido

┌─────────────────────────────┐

│ ← Tu pedido      3 prods   │

├─────────────────────────────┤

│ \[🫐\] Infusión Açaí   $25K  │

│      Caja x 12  \[−\]\[1\]\[+\]  │

│                    🗑 quitar│

├─────────────────────────────┤

│ \[🍪\] Galleta Copoazú $12K  │

│      x 2           \[−\]\[2\]\[+\]│

├─────────────────────────────┤

│ Nota para el pedido:        │

│ \[                         \] │

├─────────────────────────────┤

│ Subtotal (3 und)    $52.000 │

│ Envío          A coordinar  │

│ ─────────────────────────── │

│ Total           $52.000     │

├─────────────────────────────┤

│ 💬 Confirmar por WhatsApp   │

│ 📋 Copiar resumen           │

├─────────────────────────────┤

│ 🔒 Seguro  🌿 Natural  🚚 Nacional │

└─────────────────────────────┘

### 4\. Página Nosotros

- Historia de Mumi (texto del catálogo PDF)  
- Sección "Los frutos que nos inspiran" — card interactiva por fruto  
- Cada fruto: nombre científico, descripción, beneficios, emoji  
- Frutos: Açaí, Arazá, Copoazú, Seje, Cocona

---

## 💬 Mensaje WhatsApp automático

Cuando el cliente confirma el pedido, se genera este mensaje pre-armado y se abre WhatsApp con `wa.me/{numero}?text={mensaje}`:

Hola Mumi Amazonia 🌿

Me gustaría hacer el siguiente pedido:

🛒 \*DETALLE DEL PEDIDO\*

• 1x Infusión Açaí & Jamaica → $25.000

• 2x Galleta Copoazú → $12.000

• 1x Confite Arazá → $15.000

💰 \*Total: $52.000\*

📝 Nota: entregar en la tarde

¡Quedo pendiente de la confirmación\! 😊

---

## 📊 Métricas a registrar

Cada visita al catálogo registra en `visitas_catalogo`:

- Fecha y hora  
- Producto visto (si aplica)  
- Tipo de dispositivo (mobile/tablet/desktop) — via user-agent  
- Referrer (de dónde vino)

El módulo admin del Worker principal muestra:

- Visitas totales (semana / mes / acumulado)  
- Productos más vistos (top 5\)  
- Pedidos iniciados vs confirmados  
- Distribución por dispositivo  
- Ciudades principales (si hay geolocalización disponible)

---

## 🧩 Componentes React a crear

/apps/catalogo/src/

├── components/

│   ├── Layout/

│   │   ├── Header.tsx          \-- logo \+ chips categoría

│   │   ├── BottomNav.tsx       \-- nav inferior móvil

│   │   └── CartBar.tsx         \-- barra flotante carrito

│   ├── Catalogo/

│   │   ├── HeroCard.tsx        \-- producto destacado

│   │   ├── ProductRow.tsx      \-- fila horizontal por categoría

│   │   ├── ProductCard.tsx     \-- tarjeta individual

│   │   ├── ProductDetail.tsx   \-- pantalla detalle

│   │   └── FrutosSection.tsx   \-- chips informativos frutos

│   ├── Carrito/

│   │   ├── CartItem.tsx        \-- ítem con \+/-

│   │   ├── CartSummary.tsx     \-- subtotal y total

│   │   └── WhatsAppButton.tsx  \-- genera y abre link WA

│   └── Nosotros/

│       ├── Historia.tsx

│       └── FrutoCard.tsx

├── hooks/

│   ├── useProductos.ts         \-- fetch productos desde Supabase

│   ├── useConfig.ts            \-- fetch config\_catalogo

│   ├── useCarrito.ts           \-- estado local del carrito

│   └── useMetricas.ts          \-- registra visitas

├── pages/

│   ├── Home.tsx

│   ├── Detalle.tsx

│   ├── Carrito.tsx

│   └── Nosotros.tsx

└── lib/

    ├── supabase.ts             \-- cliente Supabase (solo lectura)

    ├── whatsapp.ts             \-- genera mensaje WA

    └── formatters.ts           \-- formato COP, fechas

---

## ⚙️ Configuración Cloudflare Workers

En `wrangler.toml` del repo, agregar segunda entrada:

\# Worker principal (ya existe)

name \= "app"

\# ... config existente ...

\# \--- Segundo Worker: catálogo público \---

\[\[env.catalogo\]\]

name \= "catalogo"

main \= "apps/catalogo/src/index.tsx"

compatibility\_date \= "2024-01-01"

\[env.catalogo.vars\]

SUPABASE\_URL \= "tu-supabase-url"

\# SUPABASE\_ANON\_KEY solo con permisos de lectura en catálogo

SUPABASE\_ANON\_KEY \= "tu-anon-key"

Deploy catálogo:

wrangler deploy \--env catalogo

---

## 🔒 Seguridad

- El catálogo usa **Supabase anon key** con RLS restrictivo  
- Solo puede leer `productos_catalogo` donde `visible = true`  
- Solo puede leer `config_catalogo`  
- Solo puede insertar en `visitas_catalogo` y `pedidos_catalogo`  
- **No puede** acceder a tablas del sistema principal (producción, costos, empleados, etc.)  
- La URL del catálogo es completamente independiente del sistema

---

## 📦 Datos de productos (seed inicial)

const PRODUCTOS\_SEED \= \[

  // INFUSIONES

  { nombre: 'Infusión de Açaí & Flor de Jamaica', categoria: 'infusion',

    precio\_detal: 25000, fruto: 'asai', visible: true, destacado: true, orden: 1,

    beneficios: \['Antioxidantes', 'Salud cardiovascular', 'Descanso reparador', 'Alivia dolores menstruales'\],

    descripcion: 'Una mezcla que combina la fuerza antioxidante del açaí silvestre del Guaviare con el delicado aroma floral y color vibrante de la flor de jamaica...' },

  { nombre: 'Infusión de Arazá, Piña y Nibs de Cacao', categoria: 'infusion',

    precio\_detal: 22000, fruto: 'araza', visible: true, orden: 2,

    beneficios: \['Vitamina C', 'Antioxidantes', 'Refrescante', 'Concentración'\],

    descripcion: 'El arazá, conocido como la guayaba amazónica, se une a la dulzura tropical de la piña deshidratada y al toque sutilmente amargo del cacao en nibs...' },

  { nombre: 'Infusión de Cocona & Limonaria', categoria: 'infusion',

    precio\_detal: 22000, fruto: 'cocona', visible: true, orden: 3,

    beneficios: \['Vitamina C', 'Refrescante', 'Mejora la digestión', 'Regula colesterol'\],

    descripcion: 'Una mezcla natural que une la acidez refrescante de la cocona con la suavidad aromática de la limonaria...' },

  { nombre: 'Infusiones Amazónicas Surtidas', categoria: 'infusion',

    precio\_detal: 90000, fruto: 'asai', visible: true, orden: 4,

    beneficios: \['Variedad amazónica', 'Antioxidantes', 'Para regalar'\],

    descripcion: 'Caja x 60 unidades surtidas. Disfruta una experiencia única con nuestras infusiones elaboradas con frutas y hierbas nativas del Guaviare.' },

  // GALLETAS

  { nombre: 'Galleta Amazónica de Açaí', categoria: 'galleta',

    precio\_detal: 6000, fruto: 'asai', visible: true, orden: 5,

    beneficios: \['Sin colorantes', 'Fruta natural', 'Sin saborizantes'\],

    descripcion: 'Deliciosas y nutritivas. Hechas con fruta amazónica deshidratada, sin colorantes ni sabores artificiales. Paquete x 40g.' },

  { nombre: 'Galleta Amazónica de Arazá', categoria: 'galleta',

    precio\_detal: 6000, fruto: 'araza', visible: true, orden: 6,

    beneficios: \['Sin colorantes', 'Vitamina C', 'Natural'\],

    descripcion: 'Galleta artesanal elaborada con pulpa y deshidratado de arazá, la guayaba amazónica del Guaviare. Paquete x 40g.' },

  { nombre: 'Galleta Amazónica de Copoazú', categoria: 'galleta',

    precio\_detal: 6000, fruto: 'copoazu', visible: true, orden: 7,

    beneficios: \['Omega-9', 'Antioxidantes', 'Cacao amazónico'\],

    descripcion: 'Galleta con el sabor único del copoazú, primo amazónico del cacao. Paquete x 40g.' },

  { nombre: 'Galleta Amazónica de Moriche', categoria: 'galleta',

    precio\_detal: 6000, fruto: 'seje', visible: true, orden: 8,

    beneficios: \['Vitamina A', 'Natural', 'Palmera amazónica'\],

    descripcion: 'Galleta artesanal elaborada con fruto de moriche, palmera sagrada de la Amazonia. Paquete x 40g.' },

  // CONFITES / BOCADILLOS

  { nombre: 'Confite Mumi de Arazá', categoria: 'confite',

    precio\_detal: 15000, fruto: 'araza', visible: true, orden: 9,

    beneficios: \['Fruta amazónica', 'Artesanal', 'Sin conservantes'\],

    descripcion: 'Bocadillo elaborado con pulpa de arazá recolectada por familias del Guaviare. Caja x 18 unidades (100g).' },

  { nombre: 'Confite Mumi de Seje', categoria: 'confite',

    precio\_detal: 15000, fruto: 'seje', visible: true, orden: 10,

    beneficios: \['Ácidos grasos', 'Vitamina E', 'Palmera sagrada'\],

    descripcion: 'Bocadillo elaborado con pulpa de seje, palmera nativa cuyo aprovechamiento artesanal es parte de tradiciones indígenas. Caja x 18 unidades.' },

  { nombre: 'Confite Mumi de Cocona', categoria: 'confite',

    precio\_detal: 15000, fruto: 'cocona', visible: true, orden: 11,

    beneficios: \['Vitamina C', 'Digestivo', 'Lulo amazónico'\],

    descripcion: 'Bocadillo con cocona, conocida como el lulo amazónico. Sabor ácido y aroma intenso. Caja x 18 unidades.' },

  // A GRANEL

  { nombre: 'Infusión a Granel Açaí, Jamaica & Limonaria', categoria: 'granel',

    precio\_detal: 35000, fruto: 'asai', visible: true, orden: 12,

    beneficios: \['75g', 'Sin empaque individual', 'Mayor rendimiento'\],

    descripcion: 'Bolsa a granel x 75g. Una fusión del açaí silvestre del Guaviare con la flor de jamaica y la limonaria.' },

  { nombre: 'Infusión a Granel Cocona, Piña & Limonaria', categoria: 'granel',

    precio\_detal: 35000, fruto: 'cocona', visible: true, orden: 13,

    beneficios: \['75g', 'Refrescante', 'Digestiva'\],

    descripcion: 'Bolsa a granel x 75g. Combina la acidez de la cocona con la piña y el aroma de la limonaria.' }

\];

---

## 🌿 Datos de frutos (sección Nosotros)

const FRUTOS \= \[

  { id: 'asai', nombre: 'Açaí', cientifico: 'Euterpe Oleracea',

    emoji: '🫐', color: '\#4a1a6b',

    descripcion: 'Palmera nativa amazónica. Sus frutos morados son conocidos por su alto contenido de antioxidantes. Comunidades nukak realizan aprovechamiento sostenible.',

    beneficios: \['Alto en antioxidantes', 'Antiinflamatorio', 'Rico en vitaminas y minerales'\] },

  { id: 'araza', nombre: 'Arazá', cientifico: 'Eugenia Stipitata',

    emoji: '🟡', color: '\#c8a900',

    descripcion: 'La guayaba amazónica. Piel amarilla y pulpa jugosa con sabor ácido-dulce. Su cultivo en sistemas agroforestales conserva la biodiversidad.',

    beneficios: \['Alto en vitamina C', 'Fortalece el sistema inmune', 'Rico en antioxidantes'\] },

  { id: 'copoazu', nombre: 'Copoazú', cientifico: 'Theobroma Grandiflorum',

    emoji: '🟤', color: '\#6b3a1a',

    descripcion: 'El cacao blanco amazónico. Emparentado con el cacao, con pulpa blanca ácida y aromática. Su cultivo brinda ingresos a familias locales.',

    beneficios: \['Omega-9 y Omega-3', 'Antioxidantes', 'Fuente de fibra'\] },

  { id: 'seje', nombre: 'Seje', cientifico: 'Oenocarpus Bataua',

    emoji: '🌴', color: '\#1a5c1a',

    descripcion: 'Palmera sagrada amazónica, también conocida como patabá o milpeso. Su aceite es de alta calidad para alimentación y cosmética natural.',

    beneficios: \['Ácidos grasos insaturados', 'Vitaminas A y E', 'Antioxidantes'\] },

  { id: 'cocona', nombre: 'Cocona', cientifico: 'Solanum Sessiliflorum',

    emoji: '🔴', color: '\#8b1a1a',

    descripcion: 'El lulo amazónico. Fruto rojo-amarillo de sabor ácido e intenso. Propiedades digestivas y reguladoras del colesterol.',

    beneficios: \['Alto en vitamina C', 'Regula el colesterol', 'Favorece la digestión'\] }

\];

---

## 🚀 Instrucciones para Claude Code

Cuando implementes el catálogo:

1. Lee este archivo completo y PROYECTO.md antes de escribir código  
2. Crea la estructura `/apps/catalogo/` dentro del repo existente  
3. Configura segundo Worker en `wrangler.toml`  
4. Crea las tablas Supabase del SQL de arriba  
5. Ejecuta el seed de productos  
6. Implementa componentes en el orden: Layout → Home → Detalle → Carrito → Nosotros  
7. El diseño debe usar la paleta Mumi exacta (variables CSS del archivo)  
8. Mobile-first — el 74% de visitas son desde celular  
9. El módulo admin del catálogo va integrado en el Worker principal (sistema), NO en el catálogo  
10. Verifica que RLS en Supabase esté configurado antes de hacer deploy

