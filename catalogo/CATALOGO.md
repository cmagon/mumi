# MUMI AMAZONIA — Catálogo Digital Público

> Documento de contexto para Claude Code. Describe la **implementación real** del
> catálogo público y su módulo de administración. Actualizado tras las fases de
> revisión de UX/datos (carritos, CRM, categorías).

---

## 🏗️ Arquitectura

- El catálogo público es un **Worker de Cloudflare** independiente (`catalogo/worker.js`)
  que sirve la SPA y, además, **inyecta SEO server-side** (OG/Twitter/JSON-LD, robots,
  sitemap, feed Google Merchant) en rutas clave, porque los rastreadores no ejecutan JS.
- **Sin autenticación** — acceso público. Usa la **anon key** de Supabase con RLS.
- **Lectura** de productos/config/banners/frutos; **escritura** solo vía RPCs
  `security definer` (visitas, pedidos, suscriptores, favoritos, carritos, mensajes).
- La **administración** vive en el Worker principal (app), no en el catálogo.
- Deploy: `npm run deploy:catalogo`.

### Flujo de datos

```
Worker principal (admin)  ──►  Supabase (fuente de verdad)  ──►  Worker catálogo (público)
  edita productos/config          finished_products / config_catalogo      lee visibles + config
                                   + tablas CRM                             escribe CRM vía RPC
```

---

## 📁 Estructura de archivos

```
catalogo/
├── worker.js            # Worker: SEO SSR + sitemap + robots + feed + fallback SPA
├── index.html
└── src/
    ├── App.jsx          # Layout, header, carrito (drawer), footer, popups
    ├── pages.jsx        # Home/Tienda, Producto, Nosotros, Páginas, Galería, Contacto, Favoritos…
    ├── store.jsx        # StoreProvider: config, productos, carrito, favoritos, mayorista
    ├── ui.jsx           # Card, HeroSlider, Banners, Impacto, Newsletter, modales de sesión
    ├── utils.js         # formato, WhatsApp, SEO, CRM (suscribir/pedido/carrito/favoritos)
    ├── supabase.js      # cliente anon
    ├── FrutoIcon / BenefitIcon / PagoIcon / Logo
    └── styles.css + themes/atelier.css

src/pages/
├── Catalogo.jsx         # Admin del catálogo: Productos, Personalizar, Config, Mensajes
└── catalogoCrm.jsx      # Admin: Correos (lista CRM + CSV) y Métricas (embudo, carritos)
```

Dos diseños de tienda: **selva** (clásico) y **atelier** (estilo editorial). Se elige en
Personalizar (`cfg.diseno`).

---

## 🗄️ Tablas Supabase (reales)

| Tabla | Uso |
| :---- | :---- |
| `finished_products` | Productos del catálogo (columnas `catalogo_*`: visible, frutos, beneficios, destacado, novedad, oferta, seo, contenido, origen, grupo/pack). Stock y precio vienen de la ficha. |
| `products_costing` | Ficha técnica enlazada (nombre, imágenes, tipo→categoría). |
| `config_catalogo` (id=1) | Config visual y de tienda: diseño, colores, fuentes, secciones, banners, SEO, envío, mayorista, `productos_extra`, `categorias_extra`, páginas, galería. |
| `frutos_catalogo` | Frutos amazónicos (icono/foto, científico, beneficios, link). |
| `banners_catalogo` | Banners hero y secundarios (imágenes responsive, overlay, enlace). |
| `visitas_catalogo` | Métricas de visita (producto, dispositivo, referrer). |
| `pedidos_catalogo` | Pedidos iniciados. `codigo` (MUMI-YYMMDD-XXXX), `estado` (`intento`→`enviado`/`fallido`), email/nombre/telefono/mayorista. |
| `suscriptores_catalogo` | Lista CRM única por correo. `origen` (newsletter/popup/favorito/carrito/contacto/pedido — **primer** contacto), `pedido_at`, `telefono`, baja por token. |
| `favoritos_catalogo` | Favoritos por correo (sesión soft). |
| `carritos_catalogo` | **Carritos de clientes identificados** (seguimiento/recuperación de abandonos). Único por correo. `estado`: `carrito`/`comprado`/`vaciado`. |
| `mensajes_catalogo` | Formulario de Contacto. |

### RPCs (security definer, `anon`+`authenticated`)

- `catalogo_cliente_por_email` — precarga nombre/teléfono en checkout.
- `catalogo_upsert_suscriptor(email, nombre, origen, telefono)` — alta sin duplicar; completa vacíos.
- `catalogo_iniciar_pedido(...)` — crea pedido con `codigo` y registra suscriptor.
- `catalogo_marcar_pedido(codigo, estado)`.
- `catalogo_listar_favoritos` / `catalogo_toggle_favorito`.
- `catalogo_guardar_carrito(email, nombre, telefono, items, total, n)` — upsert del carrito.
- `catalogo_marcar_carrito(email, estado)` — marca `comprado` al confirmar el pedido.
- `catalogo_desuscribir(token)`.

Migraciones relevantes: `v95–v99` (base), `v107` (RLS), `v135/v141` (atelier),
`v154` (packs/presentaciones), `v156–v158` (CRM, no-duplicar, teléfono),
`v162` (**carritos**).

---

## 🛒 Captura de datos y seguimiento (CRM)

- **Sesión soft por correo**: el correo actúa como identidad del cliente (localStorage
  + tablas remotas). No hay login con contraseña.
- **Checkout**: correo + nombre obligatorios; **teléfono opcional**. El pedido se
  registra en `pedidos_catalogo` y el suscriptor se actualiza en `suscriptores_catalogo`.
- **Carrito abandonado**: cuando el cliente ya tiene correo en sesión, cada cambio del
  carrito se guarda (debounce ~900 ms) en `carritos_catalogo` con estado `carrito`. Al
  confirmar el pedido pasa a `comprado`. Panel de recuperación en **Métricas** con botón
  "Recuperar" (abre WhatsApp con el nombre y los productos del carrito).
- **Leads de Contacto** entran a la lista con `origen='contacto'`.
- **Segmentación**: pestaña **Correos** (lista + etiquetas + export CSV). Etiquetas:
  suscrito, compró, mayorista, favoritos, carrito, contacto, baja.
- ⚠️ `origen` guarda solo el **primer** contacto; para "quién compró" usa `pedido_at` /
  los pedidos, y para "quién dejó carrito" usa `carritos_catalogo` (fuente confiable),
  no la etiqueta de origen.

---

## 💬 Mensaje de WhatsApp

El pedido se confirma abriendo `wa.me/{numero}?text=...` con un mensaje armado
(`construirMensajeWA`). Soporta **plantillas** con fichas `{saludo} {cliente} {pedido}
{codigo} {total} {envio} {nota} {cierre} {tienda}`. La pestaña de WhatsApp se abre de
forma **síncrona** en el gesto del usuario (evita bloqueo en iOS/Safari) y luego se le
fija la URL cuando el mensaje está listo. El teléfono del cliente se guarda en CRM,
nunca se incluye en el texto.

---

## 🎨 Diseño / identidad

Paleta Mumi (selva `#1a3a2a`, crema `#F5F0E8`, dorado `#C8A94A`, lima `#7CB342`,
tierra `#8B5E3C`, WhatsApp `#25D366`). La paleta real se **deriva de la plantilla**
configurada con utilidades de contraste WCAG (`paletaVars` en `App.jsx`): el color de
texto/acento se ajusta automáticamente para cumplir AA sobre cada fondo. Tipografías por
defecto: Playfair Display (títulos) + Source Sans 3 (cuerpo), configurables.

---

## 📊 Métricas (pestaña Métricas del admin)

Visitas (7 días, por dispositivo, productos más vistos), embudo/segmentos
(suscritos, compraron, mayoristas, 1 pedido, 2+, carritos abiertos), repetidores,
top compradores, productos más comprados/con más ingresos, y **carritos abandonados**
con recuperación por WhatsApp.

---

## ✅ Convenciones al implementar

1. Mobile-first (la mayoría de visitas son móviles).
2. La **categoría** se toma del tipo/ficha; se **normaliza** por mayúsculas/tildes en el
   store para no duplicar secciones.
3. El **carrito se re-hidrata** contra los productos frescos (precio/oferta/stock/nombre)
   y **topa por stock**; nunca confíes en el snapshot de `localStorage`.
4. Toda escritura pública va por **RPC**; respeta RLS (el catálogo no toca tablas del
   sistema principal).
5. Cambios de esquema = archivo `supabase/migration_vXXX_*.sql` aplicado **manualmente**
   en el SQL Editor.
