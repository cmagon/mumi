import { useEffect, useState } from 'react'
import { Routes, Route, Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Leaf, Truck, ShieldCheck, MessageCircle, ShoppingCart, ArrowLeft, Plus, Minus, Trash2, Instagram, Facebook, Youtube, Twitter, Music2, Heart, Send, X, Menu } from 'lucide-react'
import { useStore } from './store'
import { Home, Producto, Nosotros, Contacto, Favoritos, Mayorista, Pagina, Galeria, NoEncontrado, Desuscribir } from './pages'
import { fCOP, iconoDe, confirmarPedidoWA, suscribir, abrirWA, FAVORITOS, cargarGoogleFonts, getCliente, setCliente, getEmail, setEmail, getTelefono, setTelefono, emailValido, telefonoValido, buscarClientePorEmail, mensajeSolicitudMayorista, textoEnvio, barraPedidoMinimoEstado, barraEnvioGratisEstado, setFavicon } from './utils'
import { ModalNombre, ModalSesionCliente } from './ui'
import DOMPurify from 'dompurify'
import FrutoIcon from './FrutoIcon'
import BenefitIcon from './BenefitIcon'
import PagoIcon from './PagoIcon'

// ---- Utilidades de color para derivar la paleta de la plantilla ----
const CREMA = '#F5F0E8'
const TINTA = '#1a1a1a'
function hexToRgb(h) {
  let s = (h || '').replace('#', '')
  if (s.length === 3) s = s.split('').map(x => x + x).join('')
  const n = parseInt(s, 16)
  return isNaN(n) ? null : { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)))
const toHex = ({ r, g, b }) => '#' + [r, g, b].map(v => clamp(v).toString(16).padStart(2, '0')).join('')
// Aclara (t>0) u oscurece (t<0) un color hacia blanco/negro
function mezcla(hex, t) {
  const c = hexToRgb(hex); if (!c) return hex
  const target = t >= 0 ? 255 : 0, k = Math.abs(t)
  return toHex({ r: c.r + (target - c.r) * k, g: c.g + (target - c.g) * k, b: c.b + (target - c.b) * k })
}
// Luminancia relativa WCAG
function relLum(hex) {
  const c = hexToRgb(hex); if (!c) return 0
  const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
}
function contraste(a, b) {
  const L1 = relLum(a), L2 = relLum(b)
  const hi = Math.max(L1, L2), lo = Math.min(L1, L2)
  return (hi + 0.05) / (lo + 0.05)
}
// Elige tinta clara u oscura según mejor contraste WCAG contra el fondo
function textoSobre(fondo, claro = CREMA, oscuro = TINTA) {
  if (!fondo) return claro
  return contraste(claro, fondo) >= contraste(oscuro, fondo) ? claro : oscuro
}
// Ajusta un color hasta contraste mínimo WCAG contra un fondo (AA texto = 4.5)
function asegurarContraste(color, fondo, min = 4.5) {
  let c = color || '#C8A94A'
  const bg = fondo || CREMA
  const aclarar = relLum(bg) < 0.55
  for (let i = 0; i < 24 && contraste(c, bg) < min; i++) c = mezcla(c, aclarar ? 0.14 : -0.14)
  // Si aún no llega (colores muy saturados), fuerza tinta/crema
  if (contraste(c, bg) < min) c = aclarar ? CREMA : TINTA
  return c
}
/** Tinta de marca para temas claros: el oro/menta crudo casi nunca pasa AA → se oscurece con fuerza. */
function tintaMarcaClara(acento, ...fondos) {
  let ink = acento || '#3d4a54'
  // Primero empuja luminancia baja (oro #b8923f → marrón oscuro legible)
  for (let i = 0; i < 8 && relLum(ink) > 0.18; i++) ink = mezcla(ink, -0.18)
  for (const bg of fondos) {
    if (bg) ink = asegurarContraste(ink, bg, 5.5)
  }
  // Preferir contraste alto: si sigue flojo vs el fondo principal, mezcla con negro
  const bg0 = fondos.find(Boolean) || '#ffffff'
  if (contraste(ink, bg0) < 7) ink = asegurarContraste(mezcla(ink, -0.35), bg0, 7)
  return ink
}
function colorConAlpha(hex, a) {
  const c = hexToRgb(hex)
  if (!c) return hex
  return `rgba(${c.r},${c.g},${c.b},${a})`
}

/**
 * Sistema de color (UX): 2 marcas + 1 fondo opcional.
 * Roles: primario (header) · acento (fills/banners) · fondo (página)
 * En temas claros el acento dorado NO se usa como texto: se deriva una tinta oscura.
 */
function paletaVars(cfg) {
  const v = {}
  const prim = cfg.color_primario || '#1a3a2a'
  const sec = cfg.color_secundario || '#C8A94A'
  const fondoCfg = (cfg.color_fondo || '').trim()
  const primClaro = relLum(prim) > 0.72

  // Superficie de página: fondo configurado, o primario si es claro, o crema Mumi
  let surface = fondoCfg || (primClaro ? prim : CREMA)
  if (relLum(surface) < 0.82) surface = mezcla(surface, 0.55)
  const surfaceMuted = mezcla(surface, -0.08)
  const inkBody = asegurarContraste(TINTA, surface, 7)
  const inkSoft = asegurarContraste('#3d3d32', surface, 4.5)

  v['--crema'] = surface
  v['--crema-oscuro'] = surfaceMuted
  v['--texto'] = inkBody
  v['--texto-suave'] = inkSoft

  if (primClaro) {
    const barra = mezcla(prim, -0.04)
    const ink = tintaMarcaClara(sec, '#ffffff', prim, surface, barra)
    const onInk = textoSobre(ink)
    v['--header-bg'] = prim
    v['--barra-bg'] = barra
    v['--selva'] = ink
    // Hover más oscuro (nunca aclarar: rompería texto claro sobre botón)
    v['--selva-medio'] = mezcla(ink, -0.12)
    v['--on-primario'] = onInk
    v['--header-fg'] = ink
    // Subtítulo sólido AA (sin opacity: el oro con alpha falla siempre)
    v['--header-fg-soft'] = asegurarContraste(mezcla(ink, 0.22), prim, 4.5)
    v['--barra-fg'] = asegurarContraste(ink, barra, 4.5)
    v['--nav-opacity'] = '1'
    v['--hdr-shadow'] = '0 1px 0 rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.05)'
  } else {
    const medio = mezcla(prim, 0.16)
    const onPrim = textoSobre(prim)
    v['--header-bg'] = prim
    v['--barra-bg'] = medio
    v['--selva'] = prim
    v['--selva-medio'] = medio
    v['--on-primario'] = onPrim
    v['--header-fg'] = onPrim
    v['--header-fg-soft'] = onPrim === TINTA ? 'rgba(26,26,26,0.72)' : 'rgba(245,240,232,0.82)'
    v['--barra-fg'] = textoSobre(medio)
    v['--nav-opacity'] = '0.85'
    v['--hdr-shadow'] = '0 2px 14px rgba(0,0,0,0.18)'
  }

  // Acento: fills brillantes; textos usan variantes ya contrastadas
  const marca = v['--selva']
  const headerBg = v['--header-bg']
  const barraBg = v['--barra-bg']
  // Peor caso del gradiente mayo-invita (acento aclarado)
  const acentoClaro = mezcla(sec, 0.35)
  const onAcento = contraste(TINTA, sec) >= contraste(CREMA, sec) ? TINTA : CREMA
  const onAcentoSafe = contraste(onAcento, acentoClaro) >= 4.5
    ? onAcento
    : textoSobre(acentoClaro)
  const bannerMedio = relLum(sec) > 0.55 ? mezcla(sec, -0.28) : mezcla(sec, 0.14)
  // Lima solo para fills (ribbons); textos de categoría usan --dorado-texto
  const limaFill = mezcla(sec, 0.08)

  v['--dorado'] = sec
  v['--lima'] = limaFill
  v['--on-acento'] = onAcentoSafe
  v['--on-lima'] = textoSobre(limaFill)
  v['--dorado-texto'] = primClaro
    ? marca // en temas claros, el “texto acento” ES la tinta de marca (legible)
    : asegurarContraste(sec, surface, 4.5)
  v['--dorado-sobre-oscuro'] = asegurarContraste(sec, marca, 4.5)
  v['--acento-en-header'] = primClaro
    ? marca
    : asegurarContraste(sec, headerBg, 4.5)
  v['--acento-en-barra'] = asegurarContraste(sec, barraBg, 4.5)
  v['--banner-bg'] = sec
  v['--banner-bg-medio'] = bannerMedio
  v['--banner-fg'] = onAcentoSafe

  // Overrides opcionales por sección (Personalizar → aviso / barra / footer)
  if (cfg.aviso_color_bg) v['--aviso-bg'] = cfg.aviso_color_bg
  if (cfg.aviso_color_texto) v['--aviso-fg'] = cfg.aviso_color_texto
  else if (cfg.aviso_color_bg) v['--aviso-fg'] = textoSobre(cfg.aviso_color_bg)
  if (cfg.barra_color_bg) v['--barra-custom-bg'] = cfg.barra_color_bg
  if (cfg.barra_color_texto) v['--barra-custom-fg'] = cfg.barra_color_texto
  else if (cfg.barra_color_bg) v['--barra-custom-fg'] = textoSobre(cfg.barra_color_bg)
  if (cfg.footer_color_bg) v['--footer-bg'] = cfg.footer_color_bg
  if (cfg.footer_color_texto) v['--footer-fg'] = cfg.footer_color_texto
  else if (cfg.footer_color_bg) v['--footer-fg'] = textoSobre(cfg.footer_color_bg)

  // Barra zona mayorista (invitación + banner activo)
  if (cfg.mayo_invita_color_bg) v['--mayo-invita-bg'] = cfg.mayo_invita_color_bg
  if (cfg.mayo_invita_color_texto) v['--mayo-invita-fg'] = cfg.mayo_invita_color_texto
  else if (cfg.mayo_invita_color_bg) v['--mayo-invita-fg'] = textoSobre(cfg.mayo_invita_color_bg)
  if (cfg.mayo_invita_color_btn) v['--mayo-invita-btn-bg'] = cfg.mayo_invita_color_btn
  if (cfg.mayo_invita_color_btn_texto) v['--mayo-invita-btn-fg'] = cfg.mayo_invita_color_btn_texto
  else if (cfg.mayo_invita_color_btn) v['--mayo-invita-btn-fg'] = textoSobre(cfg.mayo_invita_color_btn)
  if (cfg.mayo_banner_color_bg) v['--mayo-banner-bg'] = cfg.mayo_banner_color_bg
  if (cfg.mayo_banner_color_texto) v['--mayo-banner-fg'] = cfg.mayo_banner_color_texto
  else if (cfg.mayo_banner_color_bg) v['--mayo-banner-fg'] = textoSobre(cfg.mayo_banner_color_bg)
  if (cfg.mayo_banner_color_acento) v['--mayo-banner-acento'] = cfg.mayo_banner_color_acento

  if (cfg.fuente_titulos) v['--fuente-titulos'] = `'${cfg.fuente_titulos}'`
  if (cfg.fuente_subtitulos) v['--fuente-subtitulos'] = `'${cfg.fuente_subtitulos}'`
  if (cfg.fuente_texto) v['--fuente-texto'] = `'${cfg.fuente_texto}'`
  return v
}

// Al navegar entre páginas, vuelve arriba del scroll de la app (no del navegador).
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    const wrap = document.querySelector('.wrap')
    if (wrap) wrap.scrollTo({ top: 0, behavior: 'auto' })
    else window.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname])
  return null
}

// Bloquea el scroll de la app mientras hay un overlay abierto
function useBodyLock(active) {
  useEffect(() => {
    if (!active) return
    const wrap = document.querySelector('.wrap')
    const prevBody = document.body.style.overflow
    const prevWrap = wrap ? wrap.style.overflow : ''
    document.body.style.overflow = 'hidden'
    if (wrap) wrap.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevBody
      if (wrap) wrap.style.overflow = prevWrap
    }
  }, [active])
}

// ---- Aviso superior: hasta 3 mensajes cortos que rotan sobre el header ----
function AvisoSuperior({ cfg }) {
  const avisos = (Array.isArray(cfg?.avisos) ? cfg.avisos : []).map(a => (typeof a === 'string' ? a : a?.texto)).filter(a => a && a.trim())
  const [i, setI] = useState(0)
  useEffect(() => { if (avisos.length <= 1) return; const t = setInterval(() => setI(x => (x + 1) % avisos.length), 5000); return () => clearInterval(t) }, [avisos.length])
  if (!avisos.length) return null
  return (
    <div className="aviso-top" role="status">
      <div className="aviso-track" key={i}>{avisos[i % avisos.length]}</div>
    </div>
  )
}

// ---- Modal de términos y política de datos ----
function ModalTerminos({ cfg, onClose }) {
  useBodyLock(true)
  return (
    <div className="overlay" style={{ alignItems: 'center' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" style={{ maxWidth: 720, maxHeight: '86vh', borderRadius: 18 }}>
        <div className="sheet-hd"><span className="serif" style={{ flex: 1 }}>Términos y política de datos</span><button className="iconbtn" onClick={onClose}><X size={20} /></button></div>
        <div className="rich-content" style={{ padding: 16, lineHeight: 1.65, color: 'var(--texto-suave)' }}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(cfg?.terminos_texto || '') }} />
      </div>
    </div>
  )
}

export default function App() {
  const { cfg, nItems, total, favs, mayorista, setMayorista, pendienteFav, cancelarPendienteFav, confirmarEmailFav, establecerEmail } = useStore()
  const loc = useLocation()
  const [verCarrito, setVerCarrito] = useState(false)
  const [menu, setMenu] = useState(false)
  const [pedirNombre, setPedirNombre] = useState(false)   // modal previo a solicitar ser mayorista
  const [verTerminos, setVerTerminos] = useState(false)
  // Si el usuario no pone nombre/slogan, se usa el valor por defecto de la app.
  // Con "solo logo" se ocultan los textos en pantallas pequeñas (solo se ve el logo).
  const marca = (cfg.nombre_tienda && cfg.nombre_tienda.trim()) ? cfg.nombre_tienda : 'Mumi Amazonia'
  const slogan = cfg.mostrar_slogan === false ? '' : ((cfg.slogan && cfg.slogan.trim()) ? cfg.slogan : (cfg.titulo_banner || 'Sabores de la selva'))
  const estilo = paletaVars(cfg)
  // Ficha Stitch/Atelier: oculta el chrome verde del catálogo (header sticky propio + CTA)
  const esAtelier = (cfg.diseno || 'selva') === 'atelier'
  const fichaAtelier = esAtelier && /^\/producto\//.test(loc.pathname)
  useBodyLock(menu)
  useEffect(() => { cargarGoogleFonts([cfg.fuente_titulos, cfg.fuente_subtitulos, cfg.fuente_texto]) }, [cfg.fuente_titulos, cfg.fuente_subtitulos, cfg.fuente_texto])
  useEffect(() => { setFavicon(cfg.favicon_url) }, [cfg.favicon_url])

  // Modo mantenimiento: el catálogo se oculta y se muestra un aviso
  const vistaProductos = (cfg.productos_vista || 'scroll') === 'grid' ? 'grid' : 'scroll'

  if (cfg.mantenimiento_activo) {
    return (
      <div className={`wrap dis-${cfg.diseno || 'selva'}`} style={estilo} data-productos-vista={vistaProductos}>
        <div className="mantenimiento">
          {cfg.logo_url ? <img src={cfg.logo_url} alt="" style={{ width: 84, height: 84, borderRadius: 16, objectFit: 'contain' }} /> : null}
          <h1 className="serif" style={{ fontSize: '1.7rem', color: 'var(--selva)', marginTop: 12 }}>{marca}</h1>
          <p style={{ color: 'var(--texto-suave)', marginTop: 8, maxWidth: '38ch' }}>
            {cfg.mantenimiento_mensaje || 'Estamos haciendo mejoras en la tienda. Volvemos muy pronto 🌿'}
          </p>
          {cfg.whatsapp && <a className="btn btn-wa" style={{ width: 'auto', marginTop: 16 }} href={`https://wa.me/${(cfg.whatsapp || '').replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer"><MessageCircle size={18} /> Escríbenos</a>}
        </div>
      </div>
    )
  }

  return (
    <div className={`wrap dis-${cfg.diseno || 'selva'}${fichaAtelier ? ' wrap-ficha-atelier' : ''}`} style={estilo} data-productos-vista={vistaProductos}>
      <ScrollToTop />
      {!fichaAtelier && <AvisoSuperior cfg={cfg} />}
      {/* Header clásico — en ficha Atelier se oculta (Stitch trae su propio chrome) */}
      {!fichaAtelier && (
        <header className={`hdr ${cfg.solo_logo ? 'solo-logo' : ''}`}>
          <div className="hdr-brand">
            <Link to="/tienda" className="hdr-link">
              {cfg.logo_url
                ? <img className="hdr-logo hdr-logo-img" src={cfg.logo_url} alt={marca || 'Logo'} />
                : null}
              <div className="hdr-textos" style={{ minWidth: 0 }}>{marca && <div className="hdr-title serif">{marca}</div>}{slogan && <div className="hdr-sub">{slogan}</div>}</div>
            </Link>
            <nav className="hdr-nav">
              <NavLink to="/tienda" className={({ isActive }) => isActive ? 'on' : ''}>Tienda</NavLink>
              {tieneNosotros(cfg) && <NavLink to="/nosotros" className={({ isActive }) => isActive ? 'on' : ''}>Nosotros</NavLink>}
              {tieneGaleria(cfg) && <NavLink to="/galeria" className={({ isActive }) => isActive ? 'on' : ''}>{cfg.galeria_titulo || 'Galería'}</NavLink>}
              {paginasVisibles(cfg).map(p => <NavLink key={p.slug} to={`/p/${p.slug}`} className={({ isActive }) => isActive ? 'on' : ''}>{p.titulo}</NavLink>)}
              <NavLink to="/contacto" className={({ isActive }) => isActive ? 'on' : ''}>Contacto</NavLink>
              {FAVORITOS && <NavLink to="/favoritos" className={({ isActive }) => `hdr-fav ${isActive ? 'on' : ''}`} aria-label="Favoritos"><Heart size={17} fill={favs.length ? 'currentColor' : 'none'} />{favs.length > 0 && <span className="hdr-fav-n">{favs.length}</span>}</NavLink>}
              {esAtelier && (
                <button type="button" className="hdr-cart" onClick={() => setVerCarrito(true)} aria-label="Pedido">
                  <ShoppingCart size={18} />{nItems > 0 && <span className="hdr-fav-n">{nItems}</span>}
                </button>
              )}
            </nav>
            <button className="hdr-burger" onClick={() => setMenu(true)} aria-label="Menú"><Menu size={24} /></button>
          </div>
        </header>
      )}

      {/* Header claro Atelier (desktop Stitch) */}
      {fichaAtelier && (
        <header className="hdr-atelier-desk">
          <Link to="/tienda" className="hdr-atelier-brand serif">{marca}</Link>
          <nav className="hdr-atelier-nav">
            <NavLink to="/tienda">Tienda</NavLink>
            {tieneNosotros(cfg) && <NavLink to="/nosotros">Nosotros</NavLink>}
            <NavLink to="/contacto">Contacto</NavLink>
          </nav>
          <div className="hdr-atelier-tools">
            {FAVORITOS && <NavLink to="/favoritos" aria-label="Favoritos"><Heart size={20} fill={favs.length ? 'currentColor' : 'none'} /></NavLink>}
            <button type="button" onClick={() => setVerCarrito(true)} aria-label="Pedido"><ShoppingCart size={20} />{nItems > 0 && <span>{nItems}</span>}</button>
          </div>
        </header>
      )}

      {/* Menú móvil */}
      {menu && (
        <div className="menu-overlay" onClick={(e) => e.target === e.currentTarget && setMenu(false)}>
          <nav className="menu-panel">
            <button className="menu-close" onClick={() => setMenu(false)} aria-label="Cerrar"><X size={22} /></button>
            <NavLink to="/tienda" onClick={() => setMenu(false)} className={({ isActive }) => isActive ? 'on' : ''}>Tienda</NavLink>
            {tieneNosotros(cfg) && <NavLink to="/nosotros" onClick={() => setMenu(false)} className={({ isActive }) => isActive ? 'on' : ''}>Nosotros</NavLink>}
            {tieneGaleria(cfg) && <NavLink to="/galeria" onClick={() => setMenu(false)} className={({ isActive }) => isActive ? 'on' : ''}>{cfg.galeria_titulo || 'Galería'}</NavLink>}
            {paginasVisibles(cfg).map(p => <NavLink key={p.slug} to={`/p/${p.slug}`} onClick={() => setMenu(false)} className={({ isActive }) => isActive ? 'on' : ''}>{p.titulo}</NavLink>)}
            <NavLink to="/contacto" onClick={() => setMenu(false)} className={({ isActive }) => isActive ? 'on' : ''}>Contacto</NavLink>
            {FAVORITOS && <NavLink to="/favoritos" onClick={() => setMenu(false)} className={({ isActive }) => isActive ? 'on' : ''}>Favoritos</NavLink>}
            {cfg.mayorista_activo && <button className="menu-mayo" onClick={() => { setMenu(false); setPedirNombre(true) }}><MessageCircle size={17} /> Ser mayorista</button>}
          </nav>
        </div>
      )}

      {/* Banner: estás viendo precios de mayorista */}
      {mayorista && !fichaAtelier && (
        <div className="mayo-banner">
          <span><ShieldCheck size={15} /> Estás viendo <strong>precios de mayorista</strong></span>
          <button onClick={() => setMayorista(false)}>Salir</button>
        </div>
      )}

      {/* Invitación a ser mayorista (barra fija bajo el nav) */}
      {!fichaAtelier && !mayorista && cfg.mayorista_activo && <InvitacionMayorista cfg={cfg} onSolicitar={() => setPedirNombre(true)} />}

      {/* Barra de beneficios — en Atelier se oculta (home más limpio, estilo Munay) */}
      {!fichaAtelier && !esAtelier && <BarraBeneficios cfg={cfg} />}

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/tienda" element={<Home />} />
        <Route path="/producto/:id" element={<Producto />} />
        <Route path="/nosotros" element={<Nosotros />} />
        <Route path="/contacto" element={<Contacto />} />
        <Route path="/favoritos" element={<Favoritos />} />
        <Route path="/mayorista" element={<Mayorista />} />
        <Route path="/desuscribir" element={<Desuscribir />} />
        <Route path="/p/:slug" element={<Pagina />} />
        <Route path="/galeria" element={<Galeria />} />
        <Route path="/galeria/:albumId" element={<Galeria />} />
        <Route path="*" element={<NoEncontrado />} />
      </Routes>

      <Footer cfg={cfg} onSolicitar={() => setPedirNombre(true)} onTerminos={() => setVerTerminos(true)} />
      {verTerminos && <ModalTerminos cfg={cfg} onClose={() => setVerTerminos(false)} />}
      {pedirNombre && (
        <ModalNombre inicial={getCliente()} titulo="¿Cómo te llamas?"
          texto="Así sabemos con quién hablamos al enviarte los precios de mayorista."
          onClose={() => setPedirNombre(false)}
          onConfirmar={(n) => { setCliente(n); setPedirNombre(false); abrirWA(cfg, mensajeSolicitudMayorista(cfg, n)) }} />
      )}
      {pendienteFav != null && (
        <ModalSesionCliente
          titulo="Guarda tus favoritos"
          texto="Indica tu correo para guardar este producto y ver tus favoritos cuando vuelvas."
          cta="Guardar favorito"
          onClose={cancelarPendienteFav}
          onConfirmar={async ({ email, nombre, telefono }) => {
            establecerEmail(email, nombre, telefono)
            try { await suscribir(email, nombre, 'favorito', telefono) } catch { /* noop */ }
            await confirmarEmailFav(email, nombre)
          }}
        />
      )}
      <WelcomePopup cfg={cfg} />

      {/* Barra carrito flotante — umbral solo dentro del drawer */}
      {nItems > 0 && !verCarrito && !fichaAtelier && (
        <button className="cartbar" onClick={() => setVerCarrito(true)}>
          <span className="cartbar-count">{nItems}</span><ShoppingCart size={20} /> Ver pedido
          <span className="cartbar-total">{fCOP(total)}</span>
        </button>
      )}
      {verCarrito && <CartDrawer onClose={() => setVerCarrito(false)} />}
    </div>
  )
}

function UmbralBar({ estado, compact, tipo }) {
  if (!estado) return null
  return (
    <div className={`umbral-bar umbral-${tipo}${compact ? ' umbral-bar-compact' : ''}${estado.ok ? ' umbral-bar-ok' : ''}`} role="status">
      <div className="umbral-bar-txt">{estado.label}</div>
      <div className="umbral-bar-track" aria-hidden="true"><div className="umbral-bar-fill" style={{ width: `${estado.pct}%` }} /></div>
    </div>
  )
}

/** Dos barras independientes: pedido mínimo sugerido ≠ envío gratis. */
function BarrasUmbralEnvio({ compact = false }) {
  const { cfg, total, mayorista } = useStore()
  const pedido = barraPedidoMinimoEstado(cfg, total, mayorista)
  const gratis = barraEnvioGratisEstado(cfg, total, mayorista)
  if (!pedido && !gratis) return null
  return (
    <div className={`umbral-stack${compact ? ' umbral-stack-compact' : ''}`}>
      <UmbralBar estado={pedido} compact={compact} tipo="pedido" />
      <UmbralBar estado={gratis} compact={compact} tipo="gratis" />
    </div>
  )
}

// ---- Invitación a ser mayorista (barra fija descartable bajo el nav) ----
function InvitacionMayorista({ cfg, onSolicitar }) {
  const [oculto, setOculto] = useState(() => { try { return sessionStorage.getItem('mumi_mayo_hide') === '1' } catch { return false } })
  if (oculto) return null
  const cerrar = () => { setOculto(true); try { sessionStorage.setItem('mumi_mayo_hide', '1') } catch { /* noop */ } }
  const tam = ['sm', 'md', 'lg'].includes(cfg.mayo_invita_tamano) ? cfg.mayo_invita_tamano : 'sm'
  return (
    <div className={`mayo-invita mayo-${tam}`}>
      <span className="mayo-invita-txt">{cfg.mayorista_mensaje || '¿Eres mayorista? Precios por volumen.'}</span>
      <button type="button" className="mayo-invita-btn" onClick={onSolicitar}><MessageCircle size={13} /> Ser mayorista</button>
      <button type="button" className="mayo-invita-x" onClick={cerrar} aria-label="Cerrar"><X size={14} /></button>
    </div>
  )
}

// ---- Carrito (drawer) ----
function CartDrawer({ onClose }) {
  const { cfg, carrito, agregar, quitar, vaciar, total, precio, mayorista, pedidoMinimo, establecerEmail } = useStore()
  const [nota, setNota] = useState('')
  const [email, setEmailForm] = useState(() => getEmail())
  const [nombre, setNombre] = useState(() => getCliente())
  const [telefono, setTelefonoForm] = useState(() => getTelefono())
  const [enviando, setEnviando] = useState(false)
  const emailOk = emailValido(email)
  const nombreOk = nombre.trim().length >= 2
  const telOk = telefonoValido(telefono)
  const puedePedir = emailOk && nombreOk && telOk && !enviando
  useBodyLock(true)

  useEffect(() => {
    if (!emailOk) return
    let cancel = false
    const t = setTimeout(async () => {
      const row = await buscarClientePorEmail(email)
      if (cancel || !row) return
      if (row.nombre && !nombre.trim()) {
        setNombre(row.nombre)
        setCliente(row.nombre)
      }
      if (row.telefono && !telefono.trim()) {
        setTelefonoForm(row.telefono)
        setTelefono(row.telefono)
      }
    }, 350)
    return () => { cancel = true; clearTimeout(t) }
  }, [email, emailOk]) // eslint-disable-line react-hooks/exhaustive-deps

  const confirmar = async () => {
    if (!puedePedir) return
    setEnviando(true)
    try {
      establecerEmail?.(email, nombre, telefono)
      await confirmarPedidoWA(
        carrito, nota, cfg, mayorista,
        mayorista ? (cfg.wa_texto_mayorista || cfg.wa_texto_stock) : cfg.wa_texto_stock,
        nombre.trim(), email.trim().toLowerCase(), telefono.trim(),
      )
      vaciar()
      onClose()
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="sheet-hd"><button className="iconbtn" onClick={onClose}><ArrowLeft size={20} /></button><span className="serif">Tu pedido</span><span style={{ fontSize: '0.82rem', color: 'var(--texto-suave)' }}>{carrito.length} prod.</span></div>
        {carrito.length === 0
          ? <p className="empty">Tu pedido está vacío.</p>
          : <>
            {carrito.map(i => (
              <div key={i.id} className="citem">
                <div className="citem-media">{i.imagen_url ? <img src={i.imagen_url} alt="" /> : <FrutoIcon name={iconoDe(i.frutos)} size={22} />}</div>
                <div className="citem-info"><div className="citem-name">{i.nombre}</div><div className="citem-price">{fCOP(precio(i) * i.cantidad)}</div></div>
                <div className="qty"><button onClick={() => agregar(i, -1)} aria-label="Quitar una unidad"><Minus size={16} /></button><span aria-live="polite">{i.cantidad}</span><button onClick={() => agregar(i, 1)} disabled={(Number(i.stock) || 0) > 0 && i.cantidad >= (Number(i.stock) || 0)} aria-label="Agregar una unidad"><Plus size={16} /></button></div>
                <button className="iconbtn" onClick={() => quitar(i.id)}><Trash2 size={18} color="var(--tierra)" /></button>
              </div>
            ))}
            <div style={{ padding: '14px 16px' }}>
              <label style={{ fontSize: '0.82rem', color: 'var(--selva)', fontWeight: 700 }}>Correo *</label>
              <input type="email" value={email} onChange={e => { setEmailForm(e.target.value); setEmail(e.target.value.trim().toLowerCase()) }} placeholder="tu@correo.com"
                style={{ width: '100%', marginTop: 6, padding: 11, borderRadius: 10, border: `1.5px solid ${emailOk ? 'var(--crema-oscuro)' : 'var(--dorado)'}`, font: 'inherit' }} />
              {!emailOk && <div style={{ fontSize: '0.76rem', color: 'var(--tierra)', marginTop: 4 }}>Necesitamos tu correo para el pedido y novedades.</div>}
              <label style={{ fontSize: '0.82rem', color: 'var(--selva)', fontWeight: 700, display: 'block', marginTop: 12 }}>Tu nombre *</label>
              <input value={nombre} onChange={e => { setNombre(e.target.value); setCliente(e.target.value.trim()) }} placeholder="¿Con quién tenemos el gusto?"
                style={{ width: '100%', marginTop: 6, padding: 11, borderRadius: 10, border: `1.5px solid ${nombreOk ? 'var(--crema-oscuro)' : 'var(--dorado)'}`, font: 'inherit' }} />
              {!nombreOk && <div style={{ fontSize: '0.76rem', color: 'var(--tierra)', marginTop: 4 }}>Escribe tu nombre para que sepamos quién hace el pedido.</div>}
              <label style={{ fontSize: '0.82rem', color: 'var(--selva)', fontWeight: 700, display: 'block', marginTop: 12 }}>Teléfono / WhatsApp *</label>
              <input type="tel" inputMode="tel" value={telefono} onChange={e => { setTelefonoForm(e.target.value); setTelefono(e.target.value.trim()) }} placeholder="Ej: 300 123 4567"
                style={{ width: '100%', marginTop: 6, padding: 11, borderRadius: 10, border: `1.5px solid ${telOk ? 'var(--crema-oscuro)' : 'var(--dorado)'}`, font: 'inherit' }} />
              {!telOk && <div style={{ fontSize: '0.76rem', color: 'var(--tierra)', marginTop: 4 }}>Indica un celular válido para contactarte.</div>}
              <label style={{ fontSize: '0.82rem', color: 'var(--texto-suave)', fontWeight: 600, display: 'block', marginTop: 12 }}>Nota (opcional)</label>
              <textarea rows={2} value={nota} onChange={e => setNota(e.target.value)} placeholder="Indicaciones adicionales para tu pedido" style={{ width: '100%', marginTop: 6, padding: 10, borderRadius: 10, border: '1.5px solid var(--crema-oscuro)', font: 'inherit', resize: 'vertical' }} />
            </div>
            {mayorista && <div style={{ padding: '0 16px', color: 'var(--selva)', fontSize: '0.8rem', fontWeight: 700 }}>Precios de mayorista aplicados 🏷️</div>}
            <div style={{ padding: '4px 16px 8px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1.1rem', color: 'var(--selva)' }}><span>Total</span><span>{fCOP(total)}</span></div>
            {textoEnvio(cfg) && <p style={{ padding: '0 16px 6px', color: 'var(--texto-suave)', fontSize: '0.82rem' }}>{textoEnvio(cfg)}</p>}
            {(cfg.envio_umbral_activo || cfg.envio_gratis_barra_activo)
              ? <div style={{ padding: '0 16px 10px' }}><BarrasUmbralEnvio /></div>
              : (pedidoMinimo > 0 && total < pedidoMinimo && (
                <p style={{ padding: '0 16px 8px', color: 'var(--tierra)', fontSize: '0.82rem' }}>
                  Pedido mínimo{mayorista ? ' mayorista' : ''} sugerido: {fCOP(pedidoMinimo)}. Puedes confirmar igual.
                </p>
              ))}
            <div className="cart-acciones">
              <button type="button" className="btn btn-ghost btn-seguir-compra" onClick={onClose}>
                Seguir comprando
              </button>
              <button className="btn btn-wa" disabled={!puedePedir} style={!puedePedir ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
                onClick={confirmar}>
                <MessageCircle size={18} /> {enviando ? 'Abriendo WhatsApp…' : 'Confirmar pedido'}
              </button>
            </div>
            {Array.isArray(cfg.pagos) && cfg.pagos.filter(p => p?.nombre).length > 0 && (
              <div className="pagos">
                <div className="pagos-tit">Medios de pago</div>
                <div className="pagos-lista">
                  {cfg.pagos.filter(p => p?.nombre).map((p, i) => (
                    <span className="pago" key={i}><PagoIcon name={p.icono} size={16} /> {p.nombre}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="trust">🔒 Seguro · 🌿 Natural · 🚚 Envío nacional</div>
          </>}
      </div>
    </div>
  )
}

// ---- Popup de bienvenida (descuento por suscribirse) ----
function WelcomePopup({ cfg }) {
  const [visible, setVisible] = useState(false)
  const [correo, setCorreo] = useState('')
  const [ok, setOk] = useState(false)
  useEffect(() => {
    if (!cfg?.popup_activo) return
    if (localStorage.getItem('mumi_welcome') === '1') return
    const t = setTimeout(() => setVisible(true), 1200)
    return () => clearTimeout(t)
  }, [cfg?.popup_activo])
  const cerrar = () => { localStorage.setItem('mumi_welcome', '1'); setVisible(false) }
  const enviar = async (e) => {
    e.preventDefault()
    try {
      await suscribir(correo, '', 'popup')
      setEmail(correo.trim().toLowerCase())
      setOk(true)
      localStorage.setItem('mumi_welcome', '1')
    } catch { setOk(true) }
  }
  useBodyLock(visible)
  if (!visible) return null
  return (
    <div className="overlay" style={{ alignItems: 'center' }} onClick={(e) => e.target === e.currentTarget && cerrar()}>
      <div className="popup">
        <button className="popup-x" onClick={cerrar} aria-label="Cerrar"><X size={20} /></button>
        <div className="popup-emoji">🌿</div>
        <h2 className="serif" style={{ color: 'var(--selva)', fontSize: '1.5rem' }}>{cfg.popup_titulo || '¡Bienvenido a Mumi!'}</h2>
        <p style={{ color: 'var(--texto-suave)', margin: '8px 0 14px' }}>{cfg.popup_texto || 'Suscríbete y recibe una sorpresa en tu primer pedido.'}</p>
        {ok
          ? <div className="news-ok" style={{ background: 'rgba(124,179,66,0.15)', color: 'var(--selva)' }}>¡Listo! Revisa tu correo 💚</div>
          : <form onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input className="cf" type="email" placeholder="Tu correo" value={correo} onChange={e => setCorreo(e.target.value)} required />
              <button className="btn btn-selva" type="submit"><Send size={16} /> Quiero mi descuento</button>
            </form>}
        <button className="popup-skip" onClick={cerrar}>No, gracias</button>
      </div>
    </div>
  )
}

// ---- ¿La página Nosotros tiene contenido? ----
export function tieneNosotros(cfg) {
  return !!(cfg?.nosotros_texto || (Array.isArray(cfg?.nosotros_bloques) && cfg.nosotros_bloques.length))
}
// Páginas personalizadas visibles en el nav (no ocultas y con al menos un bloque)
export function paginasVisibles(cfg) {
  return (Array.isArray(cfg?.paginas) ? cfg.paginas : []).filter(p => p && p.slug && !p.oculta && Array.isArray(p.bloques) && p.bloques.length)
}
// ¿Hay galería con contenido?
export function tieneGaleria(cfg) {
  return (Array.isArray(cfg?.galeria_albumes) ? cfg.galeria_albumes : []).some(a => (a.items || []).length)
}

// ---- Barra de beneficios (textos, iconos y tamaño configurables; el color depende de la plantilla) ----
function BarraBeneficios({ cfg }) {
  if (cfg?.barra_activa === false) return null
  const raw = Array.isArray(cfg?.barra_items) && cfg.barra_items.length
    ? cfg.barra_items
    : [{ texto: 'Envío nacional', icono: 'Truck' }, { texto: '100% natural', icono: 'Leaf' }, { texto: 'Compra segura', icono: 'ShieldCheck' }, { texto: 'Pedido por WhatsApp', icono: 'MessageCircle' }]
  // Compatibilidad: los ítems pueden ser strings (formato antiguo) u objetos {texto, icono}
  const items = raw.map(it => typeof it === 'string' ? { texto: it, icono: '' } : it)
  return (
    <div className={`benefits benefits-${cfg?.barra_tamano || 'md'}`}>
      {items.map((it, i) => <div className="benefit" key={i}><BenefitIcon name={it.icono} size={14} /> {it.texto}</div>)}
    </div>
  )
}

// ---- Footer (WhatsApp no va aquí: el pedido ya sale por WA desde el carrito / Contacto) ----
function Footer({ cfg, onSolicitar, onTerminos }) {
  const nombre = (cfg?.nombre_tienda || '').trim()
  const marcaFooter = nombre || 'Mumi Amazonia'
  const pais = (cfg?.pais || '').trim()
  const anio = new Date().getFullYear()
  const copy = nombre
    ? `© ${anio} ${nombre}${pais ? ` · ${pais}` : ''}`
    : `© ${anio} Todos los derechos reservados`
  const redes = [
    [cfg?.instagram_url, Instagram, 'Instagram'], [cfg?.facebook_url, Facebook, 'Facebook'],
    [cfg?.tiktok_url, Music2, 'TikTok'], [cfg?.youtube_url, Youtube, 'YouTube'], [cfg?.x_url, Twitter, 'X'],
  ].filter(([u]) => u)
  const atelier = (cfg?.diseno || 'selva') === 'atelier'

  if (atelier) {
    return (
      <footer className={`ftr ftr-atelier ftr-${cfg?.footer_tamano || 'md'}`}>
        <div className="ftr-grid">
          <div className="ftr-col">
            <div className="ftr-brand serif">{marcaFooter}</div>
            {cfg?.footer_texto?.trim()
              ? <p className="ftr-txt">{cfg.footer_texto}</p>
              : <p className="ftr-txt">Sabores artesanales de la selva. Impacto en el corazón de la Amazonía.</p>}
            {redes.length > 0 && (
              <div className="ftr-redes">
                {redes.map(([u, Ico, label]) => <a key={label} href={u} target="_blank" rel="noreferrer" aria-label={label}><Ico size={18} /></a>)}
              </div>
            )}
          </div>
          <div className="ftr-col">
            <h4 className="ftr-col-title">Mumi</h4>
            <div className="ftr-links ftr-links-col">
              <Link to="/tienda">Tienda</Link>
              {tieneNosotros(cfg) && <Link to="/nosotros">Nosotros</Link>}
              {tieneGaleria(cfg) && <Link to="/galeria">{cfg.galeria_titulo || 'Galería'}</Link>}
            </div>
          </div>
          <div className="ftr-col">
            <h4 className="ftr-col-title">Ayuda</h4>
            <div className="ftr-links ftr-links-col">
              <Link to="/contacto">Contacto</Link>
              {cfg?.terminos_texto?.trim() && <button type="button" onClick={onTerminos}>Términos</button>}
              {cfg?.mayorista_activo !== false && <button type="button" onClick={onSolicitar}>Mayorista</button>}
            </div>
          </div>
        </div>
        <div className="ftr-copy">{copy}</div>
      </footer>
    )
  }

  return (
    <footer className={`ftr ftr-${cfg?.footer_tamano || 'md'}`}>
      <div className="ftr-brand serif">{marcaFooter}</div>
      {cfg?.footer_texto?.trim() && <p className="ftr-txt">{cfg.footer_texto}</p>}
      <div className="ftr-links">
        <Link to="/tienda">Tienda</Link>
        {tieneNosotros(cfg) && <Link to="/nosotros">Nosotros</Link>}
        <Link to="/contacto">Contacto</Link>
        {cfg?.terminos_texto?.trim() && <button onClick={onTerminos}>Términos y datos</button>}
      </div>
      {redes.length > 0 && (
        <div className="ftr-redes">
          {redes.map(([u, Ico, label]) => <a key={label} href={u} target="_blank" rel="noreferrer" aria-label={label}><Ico size={18} /></a>)}
        </div>
      )}
      <div className="ftr-copy">{copy}</div>
    </footer>
  )
}
