import { useEffect, useState } from 'react'
import { Routes, Route, Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Leaf, Truck, ShieldCheck, MessageCircle, ShoppingCart, ArrowLeft, Plus, Minus, Trash2, Instagram, Facebook, Youtube, Twitter, Music2, Heart, Send, X, Menu } from 'lucide-react'
import { useStore } from './store'
import { Home, Producto, Nosotros, Contacto, Favoritos, Mayorista, Pagina, Galeria } from './pages'
import { fCOP, iconoDe, confirmarPedidoWA, suscribir, abrirWA, FAVORITOS, cargarGoogleFonts } from './utils'
import FrutoIcon from './FrutoIcon'
import Logo from './Logo'
import BenefitIcon from './BenefitIcon'

// ---- Utilidades de color para derivar la paleta de la plantilla ----
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
// Texto legible (claro/oscuro) según luminancia del fondo
function textoLegible(hex) {
  const c = hexToRgb(hex); if (!c) return '#ffffff'
  const lum = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255
  return lum > 0.6 ? '#1a1a1a' : '#F5F0E8'
}

// Genera las variables CSS de la paleta + fuentes a partir de la config de la plantilla
function paletaVars(cfg) {
  const v = {}
  const prim = cfg.color_primario, sec = cfg.color_secundario
  if (prim) {
    v['--selva'] = prim
    v['--selva-medio'] = mezcla(prim, 0.16)     // socio de degradado (mismo tono, más claro) → sin verde forzado
    // Texto del header con contraste fuerte contra la plantilla (nombre y slogan)
    v['--header-fg'] = textoLegible(prim)
    v['--header-fg-soft'] = textoLegible(prim) === '#1a1a1a' ? 'rgba(26,26,26,0.72)' : 'rgba(245,240,232,0.82)'
    // Texto de la barra de beneficios (fondo = --selva-medio)
    v['--barra-fg'] = textoLegible(mezcla(prim, 0.16))
  }
  if (sec) {
    v['--dorado'] = sec
    v['--lima'] = mezcla(sec, 0.12)              // el acento vivo deriva del color de la plantilla
  }
  // Fuentes (Google Fonts). Si no se configuran, se usan las de la app por defecto.
  if (cfg.fuente_titulos) v['--fuente-titulos'] = `'${cfg.fuente_titulos}'`
  if (cfg.fuente_subtitulos) v['--fuente-subtitulos'] = `'${cfg.fuente_subtitulos}'`
  if (cfg.fuente_texto) v['--fuente-texto'] = `'${cfg.fuente_texto}'`
  return v
}

// Al navegar entre páginas, vuelve arriba (salvo cuando solo cambian los filtros en la query).
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }) }, [pathname])
  return null
}

// Bloquea el scroll del fondo mientras hay un overlay abierto
function useBodyLock(active) {
  useEffect(() => {
    if (!active) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [active])
}

export default function App() {
  const { cfg, nItems, total, favs, mayorista, setMayorista } = useStore()
  const [verCarrito, setVerCarrito] = useState(false)
  const [menu, setMenu] = useState(false)
  // Si el usuario no pone nombre/slogan, se usa el valor por defecto de la app.
  // Con "solo logo" se ocultan los textos en pantallas pequeñas (solo se ve el logo).
  const marca = (cfg.nombre_tienda && cfg.nombre_tienda.trim()) ? cfg.nombre_tienda : 'Mumi Amazonia'
  const slogan = cfg.mostrar_slogan === false ? '' : ((cfg.slogan && cfg.slogan.trim()) ? cfg.slogan : (cfg.titulo_banner || 'Sabores de la selva'))
  const estilo = paletaVars(cfg)
  useBodyLock(menu)
  useEffect(() => { cargarGoogleFonts([cfg.fuente_titulos, cfg.fuente_subtitulos, cfg.fuente_texto]) }, [cfg.fuente_titulos, cfg.fuente_subtitulos, cfg.fuente_texto])

  return (
    <div className="wrap" style={estilo}>
      <ScrollToTop />
      {/* Header */}
      <header className={`hdr ${cfg.solo_logo ? 'solo-logo' : ''}`}>
        <div className="hdr-brand">
          <Link to="/tienda" className="hdr-link">
            {cfg.logo_url
              ? <img className="hdr-logo hdr-logo-img" src={cfg.logo_url} alt={marca || 'Logo'} />
              : <Logo className="hdr-logo" style={{ color: 'var(--dorado)' }} />}
            <div className="hdr-textos" style={{ minWidth: 0 }}>{marca && <div className="hdr-title serif">{marca}</div>}{slogan && <div className="hdr-sub">{slogan}</div>}</div>
          </Link>
          {/* Nav en escritorio */}
          <nav className="hdr-nav">
            <NavLink to="/tienda" className={({ isActive }) => isActive ? 'on' : ''}>Tienda</NavLink>
            {tieneNosotros(cfg) && <NavLink to="/nosotros" className={({ isActive }) => isActive ? 'on' : ''}>Nosotros</NavLink>}
            {tieneGaleria(cfg) && <NavLink to="/galeria" className={({ isActive }) => isActive ? 'on' : ''}>{cfg.galeria_titulo || 'Galería'}</NavLink>}
            {paginasVisibles(cfg).map(p => <NavLink key={p.slug} to={`/p/${p.slug}`} className={({ isActive }) => isActive ? 'on' : ''}>{p.titulo}</NavLink>)}
            <NavLink to="/contacto" className={({ isActive }) => isActive ? 'on' : ''}>Contacto</NavLink>
            {FAVORITOS && <NavLink to="/favoritos" className={({ isActive }) => `hdr-fav ${isActive ? 'on' : ''}`} aria-label="Favoritos"><Heart size={17} fill={favs.length ? 'currentColor' : 'none'} />{favs.length > 0 && <span className="hdr-fav-n">{favs.length}</span>}</NavLink>}
          </nav>
          {/* Botón hamburguesa en móvil */}
          <button className="hdr-burger" onClick={() => setMenu(true)} aria-label="Menú"><Menu size={24} /></button>
        </div>
      </header>

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
            {cfg.mayorista_activo && <button className="menu-mayo" onClick={() => { setMenu(false); abrirWA(cfg, cfg.mayorista_wa_texto || 'Hola, me interesa ser mayorista.') }}><MessageCircle size={17} /> Ser mayorista</button>}
          </nav>
        </div>
      )}

      {/* Banner: estás viendo precios de mayorista */}
      {mayorista && (
        <div className="mayo-banner">
          <span><ShieldCheck size={15} /> Estás viendo <strong>precios de mayorista</strong></span>
          <button onClick={() => setMayorista(false)}>Salir</button>
        </div>
      )}

      {/* Invitación a ser mayorista (barra fija bajo el nav) */}
      {!mayorista && cfg.mayorista_activo && <InvitacionMayorista cfg={cfg} />}

      {/* Barra de beneficios (configurable, debajo de la de mayorista) */}
      <BarraBeneficios cfg={cfg} />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/tienda" element={<Home />} />
        <Route path="/producto/:id" element={<Producto />} />
        <Route path="/nosotros" element={<Nosotros />} />
        <Route path="/contacto" element={<Contacto />} />
        <Route path="/favoritos" element={<Favoritos />} />
        <Route path="/mayorista" element={<Mayorista />} />
        <Route path="/p/:slug" element={<Pagina />} />
        <Route path="/galeria" element={<Galeria />} />
        <Route path="/galeria/:albumId" element={<Galeria />} />
        <Route path="*" element={<Home />} />
      </Routes>

      <Footer cfg={cfg} />
      <WelcomePopup cfg={cfg} />

      {/* Barra carrito flotante */}
      {nItems > 0 && !verCarrito && (
        <button className="cartbar" onClick={() => setVerCarrito(true)}>
          <span className="cartbar-count">{nItems}</span><ShoppingCart size={20} /> Ver pedido
          <span className="cartbar-total">{fCOP(total)}</span>
        </button>
      )}
      {verCarrito && <CartDrawer onClose={() => setVerCarrito(false)} />}
    </div>
  )
}

// ---- Invitación a ser mayorista (barra fija descartable bajo el nav) ----
function InvitacionMayorista({ cfg }) {
  const [oculto, setOculto] = useState(() => { try { return sessionStorage.getItem('mumi_mayo_hide') === '1' } catch { return false } })
  if (oculto) return null
  const cerrar = () => { setOculto(true); try { sessionStorage.setItem('mumi_mayo_hide', '1') } catch { /* noop */ } }
  const pedir = () => abrirWA(cfg, cfg.mayorista_wa_texto || 'Hola, me interesa ser mayorista.')
  return (
    <div className="mayo-invita">
      <span className="mayo-invita-txt">{cfg.mayorista_mensaje || '¿Eres mayorista? Accede a precios especiales por volumen.'}</span>
      <button className="mayo-invita-btn" onClick={pedir}><MessageCircle size={14} /> Quiero ser mayorista</button>
      <button className="mayo-invita-x" onClick={cerrar} aria-label="Cerrar"><X size={16} /></button>
    </div>
  )
}

// ---- Carrito (drawer) ----
function CartDrawer({ onClose }) {
  const { cfg, carrito, agregar, quitar, total, precio, mayorista, pedidoMinimo } = useStore()
  const [nota, setNota] = useState('')
  useBodyLock(true)
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
                <div className="qty"><button onClick={() => agregar(i, -1)}><Minus size={16} /></button><span>{i.cantidad}</span><button onClick={() => agregar(i, 1)}><Plus size={16} /></button></div>
                <button className="iconbtn" onClick={() => quitar(i.id)}><Trash2 size={18} color="var(--tierra)" /></button>
              </div>
            ))}
            <div style={{ padding: '14px 16px' }}>
              <label style={{ fontSize: '0.82rem', color: 'var(--texto-suave)', fontWeight: 600 }}>Nota para el pedido</label>
              <textarea rows={2} value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej: entregar en la tarde…" style={{ width: '100%', marginTop: 6, padding: 10, borderRadius: 10, border: '1.5px solid var(--crema-oscuro)', font: 'inherit', resize: 'vertical' }} />
            </div>
            {mayorista && <div style={{ padding: '0 16px', color: 'var(--selva)', fontSize: '0.8rem', fontWeight: 700 }}>Precios de mayorista aplicados 🏷️</div>}
            <div style={{ padding: '4px 16px 8px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1.1rem', color: 'var(--selva)' }}><span>Total</span><span>{fCOP(total)}</span></div>
            {pedidoMinimo > 0 && total < pedidoMinimo && <p style={{ padding: '0 16px 8px', color: 'var(--tierra)', fontSize: '0.82rem' }}>Pedido mínimo{mayorista ? ' mayorista' : ''} sugerido: {fCOP(pedidoMinimo)}</p>}
            <div style={{ padding: '4px 16px 16px' }}><button className="btn btn-wa" onClick={() => confirmarPedidoWA(carrito, nota, cfg, mayorista, cfg.wa_texto_stock)}><MessageCircle size={18} /> Confirmar por WhatsApp</button></div>
            <div className="trust">🔒 Seguro · 🌿 Natural · 🚚 Envío nacional</div>
          </>}
      </div>
    </div>
  )
}

// ---- Popup de bienvenida (descuento por suscribirse) ----
function WelcomePopup({ cfg }) {
  const [visible, setVisible] = useState(false)
  const [email, setEmail] = useState('')
  const [ok, setOk] = useState(false)
  useEffect(() => {
    if (!cfg?.popup_activo) return
    if (localStorage.getItem('mumi_welcome') === '1') return
    const t = setTimeout(() => setVisible(true), 1200)
    return () => clearTimeout(t)
  }, [cfg?.popup_activo])
  const cerrar = () => { localStorage.setItem('mumi_welcome', '1'); setVisible(false) }
  const enviar = async (e) => { e.preventDefault(); try { await suscribir(email); setOk(true); localStorage.setItem('mumi_welcome', '1') } catch { /* muestra igual */ setOk(true) } }
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
              <input className="cf" type="email" placeholder="Tu correo" value={email} onChange={e => setEmail(e.target.value)} required />
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

// ---- Footer ----
function Footer({ cfg }) {
  const wa = (cfg?.whatsapp || '+573157702180').replace(/[^0-9]/g, '')
  const nombre = (cfg?.nombre_tienda || '').trim()          // nombre de la empresa (config)
  const marcaFooter = nombre || 'Mumi Amazonia'             // encabezado del footer (sin emoji)
  const pais = (cfg?.pais || '').trim()
  const anio = new Date().getFullYear()
  // Copyright automático: si no hay empresa configurada → genérico
  const copy = nombre
    ? `© ${anio} ${nombre}${pais ? ` · ${pais}` : ''}`
    : `© ${anio} Todos los derechos reservados`
  const redes = [
    [cfg?.instagram_url, Instagram, 'Instagram'], [cfg?.facebook_url, Facebook, 'Facebook'],
    [cfg?.tiktok_url, Music2, 'TikTok'], [cfg?.youtube_url, Youtube, 'YouTube'], [cfg?.x_url, Twitter, 'X'],
  ].filter(([u]) => u)
  return (
    <footer className={`ftr ftr-${cfg?.footer_tamano || 'md'}`}>
      <div className="ftr-brand serif">{marcaFooter}</div>
      {cfg?.footer_texto?.trim() && <p className="ftr-txt">{cfg.footer_texto}</p>}
      <div className="ftr-links">
        <Link to="/tienda">Tienda</Link>
        {tieneNosotros(cfg) && <Link to="/nosotros">Nosotros</Link>}
        <Link to="/contacto">Contacto</Link>
        <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">WhatsApp</a>
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
