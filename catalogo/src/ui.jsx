import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSwipeable } from 'react-swipeable'
import { Plus, ChevronLeft, ChevronRight, Send, Heart, X, MessageCircle } from 'lucide-react'
import { fCOP, labelCategoria, iconoDe, stockLabel, suscribir, FAVORITOS, imgsDe, imgSrc, altImg, emailValido, telefonoValido, getEmail, getCliente, getTelefono, buscarClientePorEmail, setCliente, setEmail, setTelefono } from './utils'
import FrutoIcon from './FrutoIcon'
import { useStore } from './store'

// Extrae el ID de un video de YouTube desde varias formas de URL
export function ytId(u) {
  if (!u) return ''
  const m = String(u).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/)
  return m ? m[1] : (/^[\w-]{11}$/.test(u) ? u : '')
}

/** Imagen de banner responsive: móvil ≤700 · tablet ≤1024 · web resto. Fallbacks encadenados. */
export function BannerPicture({ b, className = '', alt = '' }) {
  const web = (b?.imagen_url || '').trim()
  const tablet = (b?.imagen_tablet || '').trim()
  const mobile = (b?.imagen_mobile || '').trim()
  const src = web || tablet || mobile
  if (!src) return null
  const hasTablet = !!tablet
  return (
    <picture>
      {mobile ? <source media="(max-width: 700px)" srcSet={mobile} /> : null}
      {tablet ? <source media="(min-width: 701px) and (max-width: 1024px)" srcSet={tablet} /> : null}
      <img
        className={className}
        src={src}
        alt={alt}
        data-tablet={hasTablet ? '1' : undefined}
      />
    </picture>
  )
}

function contrasteSobre(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim())
  if (!m) return '#1a1a1a'
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return L > 0.55 ? '#1a1a1a' : '#ffffff'
}

function hexToRgba(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim())
  if (!m) return `rgba(0,0,0,${a})`
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

function opacidadBanner(v, def = 0.72) {
  if (v == null || v === '') return def
  const n = Number(v)
  if (!Number.isFinite(n)) return def
  return Math.min(1, Math.max(0, n > 1 ? n / 100 : n))
}

/** Colores propios del banner: capa del texto (overlay) + tipografía + botón. */
export function estiloBanner(b) {
  if (!b) return undefined
  const s = {}
  const ov = (b.color_overlay || b.color_fondo || '').trim()
  const op = opacidadBanner(b.overlay_opacidad)
  // Opacidad siempre (0–1). Degradado CSS: 0% izq → fill a ~50% del panel
  s['--banner-overlay-op'] = String(op)
  if (ov) {
    s['--banner-capa'] = ov
    s['--banner-bg'] = ov
    s['--banner-bg-medio'] = ov
    s['--banner-overlay-soft'] = hexToRgba(ov, op * 0.1)
    s['--banner-overlay-mid'] = hexToRgba(ov, op * 0.38)
    s['--banner-overlay-fill'] = hexToRgba(ov, op)
  }
  // Tipografía: color explícito, o contraste automático sobre la capa
  const fg = (b.color_texto || '').trim() || (ov ? contrasteSobre(ov) : '')
  if (fg) s['--banner-fg'] = fg
  const btn = (b.color_boton || '').trim()
  if (btn) {
    s['--banner-cta-bg'] = btn
    s['--banner-cta-fg'] = contrasteSobre(btn)
  }
  return Object.keys(s).length ? s : undefined
}

export function bannerConTexto(b) {
  return !!(b?.titulo?.trim() || b?.subtitulo?.trim() || b?.boton_texto?.trim())
}

/** Chips de pack/presentación (x6, x12…) — no abren la ficha. */
function PackChips({ packs, selId, onSelect }) {
  if (!packs || packs.length < 2) return null
  return (
    <div className="card-packs" role="group" aria-label="Presentaciones" onClick={(e) => e.stopPropagation()}>
      {packs.map(pr => (
        <button
          key={pr.id}
          type="button"
          className={`card-pack${String(selId) === String(pr.id) ? ' on' : ''}${(pr.stock ?? 0) <= 0 ? ' off' : ''}`}
          onClick={() => onSelect(pr.id)}
          title={pr.nombre || pr.label}
        >
          {pr.label}
        </button>
      ))}
    </div>
  )
}

// ---- Tarjeta de producto ----
export function Card({ p, cfg, n: nProp = 0, onOpen, onAdd }) {
  const { esFav, toggleFav, precio, mayorista, enOferta, descuentoPct, productoPorId, agregar, enCarrito } = useStore()
  const packs = Array.isArray(p.presentaciones) && p.presentaciones.length > 1 ? p.presentaciones : null
  const [selId, setSelId] = useState(p.id)
  useEffect(() => { setSelId(p.id) }, [p.id])
  const activo = (packs && productoPorId(selId)) || p
  const n = packs ? enCarrito(activo.id) : nProp
  const agotado = (activo.stock ?? 0) <= 0
  const st = stockLabel(activo.stock, cfg)
  const fav = esFav(activo.id)
  const oferta = enOferta(activo)
  const atelier = (cfg?.diseno || 'selva') === 'atelier'
  const portada = imgsDe(activo)[0]
  const srcWeb = imgSrc(portada || activo.imagen_url, false)
  const srcMob = imgSrc(portada || activo.imagen_url, true)
  const meta = [activo.contenido, activo.origen].filter(Boolean).join(' · ')
  const abrir = () => (onOpen ? onOpen(activo) : null)
  const add = () => {
    if (agotado) return
    if (packs) agregar(activo, 1)
    else if (onAdd) onAdd()
    else agregar(activo, 1)
  }
  const addBtn = agotado
    ? <button type="button" className="card-add card-add-off" disabled aria-label="Agotado">{atelier ? <Plus size={18} /> : 'Agotado'}</button>
    : <button type="button" className="card-add" onClick={(e) => { e.stopPropagation(); add() }} aria-label="Agregar">
        <Plus size={atelier ? 18 : 15} /> {atelier ? (n > 0 ? `${n}` : '') : (n > 0 ? `Agregar (${n})` : 'Agregar')}
      </button>
  return (
    <div className={`card ${atelier ? 'card-atelier' : ''}`}>
      <div className="card-media" onClick={abrir}>
        {srcWeb
          ? <picture>
              {srcMob && srcMob !== srcWeb ? <source media="(max-width: 700px)" srcSet={srcMob} /> : null}
              <img src={srcWeb} alt={altImg(activo, portada)} />
            </picture>
          : <span className="ph-fruto"><FrutoIcon name={iconoDe(activo.frutos)} size={44} /></span>}
        {oferta && <span className="ribbon ribbon-oferta">{atelier ? 'Oferta' : `-${descuentoPct(activo)}%`}</span>}
        {activo.novedad && !oferta && <span className="ribbon ribbon-nuevo">Nuevo</span>}
        {agotado && <span className="ribbon ribbon-agotado">Agotado</span>}
        {FAVORITOS && <button type="button" className={`fav-btn ${fav ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); toggleFav(activo.id) }} aria-label="Favorito"><Heart size={17} fill={fav ? 'currentColor' : 'none'} /></button>}
        {atelier && addBtn}
      </div>
      <div className="card-body">
        {atelier ? (
          <>
            <div className="card-row">
              <button type="button" className="card-name" onClick={abrir}>{activo.nombre}</button>
              <div className="card-price">{fCOP(precio(activo))}{oferta && <span className="precio-antes">{fCOP(activo.precio_detal)}</span>}</div>
            </div>
            <PackChips packs={packs} selId={selId} onSelect={setSelId} />
            {meta ? <div className="card-meta">{meta}</div> : null}
            {st && (st.tono === 'urgente' || st.tono === 'pocas') && <div className={`stock-tag stock-${st.tono}`}>🔥 {st.texto}</div>}
            <button type="button" className={`card-add card-add-desk ${agotado ? 'card-add-off' : ''}`} disabled={agotado}
              onClick={(e) => { e.stopPropagation(); add() }}>
              <Plus size={14} /> {agotado ? 'Agotado' : (n > 0 ? `Añadir (${n})` : 'Añadir')}
            </button>
          </>
        ) : (
          <>
            <div className="card-name" onClick={abrir}>{activo.nombre}</div>
            <PackChips packs={packs} selId={selId} onSelect={setSelId} />
            {st && (st.tono === 'urgente' || st.tono === 'pocas') && <div className={`stock-tag stock-${st.tono}`}>🔥 {st.texto}</div>}
            <div className="card-price">{fCOP(precio(activo))}{oferta && <span className="precio-antes">{fCOP(activo.precio_detal)}</span>}{mayorista && activo.precio_mayor > 0 && <span className="precio-tag">mayor</span>}</div>
            {addBtn}
          </>
        )}
      </div>
    </div>
  )
}

// ---- Hero de marca (Atelier): banner principal tiene prioridad; resto = Personalizar → Portada ----
export function BrandHero({ cfg, banner }) {
  const nav = useNavigate()
  const tieneMediaBanner = !!(banner?.imagen_url || banner?.imagen_tablet || banner?.imagen_mobile)
  const fallbackHero = (!tieneMediaBanner && cfg.hero_imagen) ? { imagen_url: cfg.hero_imagen } : null
  const mediaBanner = tieneMediaBanner ? banner : fallbackHero
  const yt = banner?.tipo === 'youtube' ? ytId(banner.youtube) : ''
  // Banner con media y sin título/subtítulo/botón → solo imagen (sin capa de texto)
  const soloMedia = !!(tieneMediaBanner && banner && !bannerConTexto(banner))
  // Si hay banner: solo sus textos (sin rellenar con defaults de Personalizar)
  const title = soloMedia ? '' : (tieneMediaBanner
    ? (banner?.titulo || '').trim()
    : (cfg.titulo_banner || 'Sabiduría de la selva, en cada sorbo.').trim())
  const sub = soloMedia ? '' : (tieneMediaBanner
    ? (banner?.subtitulo || '').trim()
    : (cfg.subtitulo || cfg.slogan || '').trim())
  const cta = soloMedia ? '' : (tieneMediaBanner
    ? (banner?.boton_texto || '').trim()
    : (cfg.hero_cta_texto || 'Explorar catálogo').trim())
  const link = (banner?.boton_link || cfg.hero_cta_link || '/tienda').trim()
  const cta2 = (cfg.hero_cta2_texto || 'Nuestra historia').trim()
  const mostrarCta2 = !soloMedia && !tieneMediaBanner && cfg.hero_mostrar_cta2 !== false
  const tieneNosotros = !!(cfg?.nosotros_texto?.trim() || (Array.isArray(cfg?.nosotros_bloques) && cfg.nosotros_bloques.length))
  const mostrarCopy = !soloMedia && !!(title || sub || cta)
  return (
    <section className={`brand-hero${soloMedia ? ' brand-hero-solo-media' : ''}`} aria-label="Portada" style={soloMedia ? undefined : estiloBanner(banner)}>
      <div className="brand-hero-media">
        {yt
          ? <iframe className="brand-hero-img" src={`https://www.youtube.com/embed/${yt}?autoplay=1&mute=1&loop=1&playlist=${yt}&controls=0&modestbranding=1&playsinline=1`} title={title || 'Portada'} allow="autoplay; encrypted-media" />
          : (mediaBanner
            ? <BannerPicture b={mediaBanner} className="brand-hero-img" alt="" />
            : <div className="brand-hero-ph" aria-hidden />)}
      </div>
      {mostrarCopy && (
        <div className="brand-hero-overlay">
          <div className="brand-hero-copy">
            {title ? <h1 className="serif brand-hero-title">{title}</h1> : null}
            {sub ? <p className="brand-hero-sub">{sub}</p> : null}
            <div className="brand-hero-ctas">
              {cta ? <button type="button" className="btn btn-selva" onClick={() => irEnlace(nav, link)}>{cta}</button> : null}
              {mostrarCta2 && tieneNosotros && cta2 && (
                <Link to="/nosotros" className="btn btn-ghost brand-hero-ghost">{cta2}</Link>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

// ---- Bloque impacto (inspirado en Munay / Stitch) ----
export function Impacto({ cfg }) {
  if (cfg?.impacto_activo === false) return null
  const titulo = (cfg.impacto_titulo || 'Impacto que florece').trim()
  const texto = (cfg.impacto_texto || 'Cada producto apoya a comunidades recolectoras de la Amazonía colombiana: comercio justo y conservación de la biodiversidad.').trim()
  const s1n = cfg.impacto_stat1_n || '45+'
  const s1l = cfg.impacto_stat1_l || 'Productores'
  const s2n = cfg.impacto_stat2_n || '10'
  const s2l = cfg.impacto_stat2_l || 'Departamentos'
  const img = cfg.impacto_imagen || ''
  return (
    <section className="impacto">
      <div className="impacto-inner">
        <div className="impacto-copy">
          <h2 className="serif impacto-title">{titulo}</h2>
          <p className="impacto-txt">{texto}</p>
          <div className="impacto-stats">
            <div className="impacto-stat"><strong>{s1n}</strong><span>{s1l}</span></div>
            <div className="impacto-stat"><strong>{s2n}</strong><span>{s2l}</span></div>
          </div>
          {(cfg.impacto_link_texto !== '') && (
            <Link to="/nosotros" className="impacto-link">{(cfg.impacto_link_texto || 'Conoce más').trim()} <ChevronRight size={16} /></Link>
          )}
        </div>
        {img ? (
          <div className="impacto-media"><img src={img} alt="" /></div>
        ) : (
          <div className="impacto-media impacto-media-ph" aria-hidden />
        )}
      </div>
    </section>
  )
}

// ---- Hero slider (soporta BANNERS [imagen/YouTube] y productos destacados) ----
// Abre el enlace de un banner: interno → navegación SPA; externo → nueva pestaña
export function irEnlace(nav, link) {
  const l = (link || '').trim(); if (!l) return
  if (/^https?:\/\//i.test(l)) window.open(l, '_blank')
  else nav(l.startsWith('/') ? l : `/${l}`)
}

export function HeroSlider({ slides, onOpen }) {
  const { precio } = useStore()
  const nav = useNavigate()
  const [i, setI] = useState(0)
  const n = slides.length
  useEffect(() => { if (n <= 1) return; const t = setInterval(() => setI(x => (x + 1) % n), 6000); return () => clearInterval(t) }, [n])
  const go = (d) => setI(x => (x + d + n) % n)
  const s = slides[i]
  const esBanner = !!s?.tipo
  const yt = esBanner && s.tipo === 'youtube' ? ytId(s.youtube) : ''
  const tieneMedia = !!(s?.imagen_url || s?.imagen_tablet || s?.imagen_mobile || yt)
  // Banner sin título/subtítulo/botón → solo media (sin panel/capa de texto en móvil ni PC)
  const conTexto = esBanner ? bannerConTexto(s) : true
  const limpio = esBanner && !conTexto && tieneMedia

  const media = esBanner
    ? (yt
      ? <iframe className="hero-yt" src={`https://www.youtube.com/embed/${yt}?autoplay=1&mute=1&loop=1&playlist=${yt}&controls=0&modestbranding=1&playsinline=1`} title={s.titulo || 'video'} allow="autoplay; encrypted-media" frameBorder="0" />
      : (tieneMedia
        ? <BannerPicture b={s} className="hero-img" alt={s.titulo || ''} />
        : <div className="hero-emoji"><FrutoIcon name="hoja" size={90} /></div>))
    : (s.imagen_url
      ? <img className="hero-img" src={s.imagen_url} alt={s.nombre} />
      : <div className="hero-emoji"><FrutoIcon name={iconoDe(s.frutos)} size={90} /></div>)

  const panelTexto = esBanner
    ? (conTexto ? (
      <div className="hero-body">
        {s.titulo?.trim() ? <div className="hero-name serif">{s.titulo.trim()}</div> : null}
        {s.subtitulo?.trim() ? <div className="hero-sub">{s.subtitulo.trim()}</div> : null}
        {s.boton_texto?.trim() ? <span className="hero-cta">{s.boton_texto.trim()} →</span> : null}
      </div>
    ) : null)
    : (
      <div className="hero-body">
        <div className="hero-cat">{labelCategoria(s.categoria)}</div>
        <div className="hero-name serif">{s.nombre}</div>
        <div className="hero-price">{fCOP(precio(s))}</div>
        <span className="hero-cta">Ver producto →</span>
      </div>
    )

  const onClick = () => { if (esBanner) irEnlace(nav, s.boton_link); else onOpen(s) }
  const swipe = useSwipeable({ onSwipedLeft: () => n > 1 && go(1), onSwipedRight: () => n > 1 && go(-1), preventScrollOnSwipe: true, trackTouch: true, trackMouse: false, delta: 30 })

  return (
    <div
      className={`hero${limpio ? ' hero-limpio' : ''}${conTexto ? ' hero-con-texto' : ''}`}
      {...swipe}
      onClick={onClick}
      style={{
        cursor: (esBanner && !s.boton_link) ? 'default' : 'pointer',
        touchAction: n > 1 ? 'pan-y' : undefined,
        ...(esBanner && conTexto ? (estiloBanner(s) || {}) : {}),
      }}
    >
      {media}
      {panelTexto}
      {n > 1 && <>
        <button className="hero-nav left" onClick={e => { e.stopPropagation(); go(-1) }} aria-label="Anterior"><ChevronLeft size={22} /></button>
        <button className="hero-nav right" onClick={e => { e.stopPropagation(); go(1) }} aria-label="Siguiente"><ChevronRight size={22} /></button>
        <div className="hero-dots">{slides.map((_, k) => <span key={k} className={`dot ${k === i ? 'on' : ''}`} onClick={e => { e.stopPropagation(); setI(k) }} />)}</div>
      </>}
    </div>
  )
}

// ---- Banner secundario (textos y botón centrados, con overlay de contraste) ----
export function BannerSecundario({ b }) {
  const nav = useNavigate()
  const yt = b.tipo === 'youtube' ? ytId(b.youtube) : ''
  const clickable = !!b.boton_link
  const onClick = () => irEnlace(nav, b.boton_link)
  // Sin título/subtítulo/botón → solo imagen (sin capa de contraste)
  const conTexto = bannerConTexto(b)
  return (
    <div className={`bsec${conTexto ? ' bsec-con-texto' : ' bsec-limpio'}`} onClick={onClick} style={{ cursor: clickable ? 'pointer' : 'default', ...(conTexto ? (estiloBanner(b) || {}) : {}) }}>
      {yt
        ? <iframe className="bsec-media" src={`https://www.youtube.com/embed/${yt}?autoplay=1&mute=1&loop=1&playlist=${yt}&controls=0&modestbranding=1&playsinline=1`} title={b.titulo || 'video'} allow="autoplay; encrypted-media" frameBorder="0" />
        : ((b.imagen_url || b.imagen_tablet || b.imagen_mobile)
          ? <BannerPicture b={b} className="bsec-media" alt={b.titulo || ''} />
          : <div className="bsec-media bsec-ph" />)}
      {conTexto ? (
        <div className="bsec-overlay">
          {b.titulo?.trim() ? <div className="bsec-title serif">{b.titulo.trim()}</div> : null}
          {b.subtitulo?.trim() ? <div className="bsec-sub">{b.subtitulo.trim()}</div> : null}
          {b.boton_texto?.trim() ? <span className="bsec-btn">{b.boton_texto.trim()}</span> : null}
        </div>
      ) : null}
    </div>
  )
}

// ---- Grupo de banners secundarios: varias imágenes = slide; una = estático ----
export function BannerGrupo({ banners }) {
  const [i, setI] = useState(0)
  const n = banners.length
  useEffect(() => { if (n <= 1) return; const t = setInterval(() => setI(x => (x + 1) % n), 6000); return () => clearInterval(t) }, [n])
  const swipe = useSwipeable({ onSwipedLeft: () => setI(x => (x + 1) % n), onSwipedRight: () => setI(x => (x - 1 + n) % n), preventScrollOnSwipe: true, trackTouch: true, trackMouse: false, delta: 30 })
  if (n === 0) return null
  if (n === 1) return <BannerSecundario b={banners[0]} />
  const go = (d) => setI(x => (x + d + n) % n)
  return (
    <div className="bsec-grupo" {...swipe} style={{ touchAction: 'pan-y' }}>
      <BannerSecundario b={banners[i]} />
      <button className="hero-nav left" onClick={e => { e.stopPropagation(); go(-1) }} aria-label="Anterior"><ChevronLeft size={22} /></button>
      <button className="hero-nav right" onClick={e => { e.stopPropagation(); go(1) }} aria-label="Siguiente"><ChevronRight size={22} /></button>
      <div className="hero-dots">{banners.map((_, k) => <span key={k} className={`dot ${k === i ? 'on' : ''}`} onClick={() => setI(k)} />)}</div>
    </div>
  )
}

// ---- Modal que pide el nombre antes de abrir WhatsApp ----
export function ModalNombre({ titulo = '¿Cuál es tu nombre?', texto, inicial = '', onConfirmar, onClose }) {
  const [v, setV] = useState(inicial)
  const ok = v.trim().length >= 2
  return (
    <div className="overlay" style={{ alignItems: 'center' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="popup" style={{ textAlign: 'left' }}>
        <button className="popup-x" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        <h2 className="serif" style={{ color: 'var(--selva)', fontSize: '1.3rem' }}>{titulo}</h2>
        {texto && <p style={{ color: 'var(--texto-suave)', margin: '6px 0 12px', fontSize: '0.9rem' }}>{texto}</p>}
        <form onSubmit={(e) => { e.preventDefault(); if (ok) onConfirmar(v.trim()) }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input className="cf" autoFocus value={v} onChange={e => setV(e.target.value)} placeholder="Tu nombre" />
          <button className="btn btn-wa" type="submit" disabled={!ok} style={!ok ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}>
            <MessageCircle size={18} /> Continuar por WhatsApp
          </button>
        </form>
      </div>
    </div>
  )
}

/** Correo (sesión) + nombre + teléfono. Precarga si el correo ya está registrado. */
export function ModalSesionCliente({
  titulo = 'Identifícate para continuar',
  texto = 'Usamos tu correo para guardar favoritos y agilizar tu pedido.',
  emailInicial = '',
  nombreInicial = '',
  telefonoInicial = '',
  pedirTelefono = true,
  cta = 'Continuar',
  onConfirmar,
  onClose,
}) {
  const [email, setE] = useState(emailInicial || getEmail() || '')
  const [nombre, setN] = useState(nombreInicial || getCliente() || '')
  const [telefono, setT] = useState(telefonoInicial || getTelefono() || '')
  const [buscando, setBuscando] = useState(false)
  const emailOk = emailValido(email)
  const nombreOk = nombre.trim().length >= 2
  const telOk = !pedirTelefono || telefonoValido(telefono)
  const formOk = emailOk && nombreOk && telOk

  useEffect(() => {
    if (!emailOk) return
    let cancel = false
    const t = setTimeout(async () => {
      setBuscando(true)
      try {
        const row = await buscarClientePorEmail(email)
        if (cancel || !row) return
        if (row.nombre && !nombre.trim()) setN(row.nombre)
        if (row.telefono && !telefono.trim()) setT(row.telefono)
      } finally { if (!cancel) setBuscando(false) }
    }, 400)
    return () => { cancel = true; clearTimeout(t) }
  }, [email, emailOk]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="overlay" style={{ alignItems: 'center' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="popup" style={{ textAlign: 'left' }}>
        <button className="popup-x" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        <h2 className="serif" style={{ color: 'var(--selva)', fontSize: '1.3rem' }}>{titulo}</h2>
        {texto && <p style={{ color: 'var(--texto-suave)', margin: '6px 0 12px', fontSize: '0.9rem' }}>{texto}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!formOk) return
            const em = email.trim().toLowerCase()
            const nom = nombre.trim()
            const tel = telefono.trim()
            setEmail(em)
            setCliente(nom)
            if (tel) setTelefono(tel)
            onConfirmar({ email: em, nombre: nom, telefono: tel })
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--selva)' }}>Correo *</label>
          <input className="cf" type="email" autoFocus value={email} onChange={e => setE(e.target.value)} placeholder="tu@correo.com" required />
          <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--selva)' }}>Nombre *{buscando ? ' · buscando…' : ''}</label>
          <input className="cf" value={nombre} onChange={e => setN(e.target.value)} placeholder="¿Cómo te llamas?" />
          {pedirTelefono && (
            <>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--selva)' }}>Teléfono / WhatsApp *</label>
              <input className="cf" type="tel" inputMode="tel" value={telefono} onChange={e => setT(e.target.value)} placeholder="Ej: 300 123 4567" />
            </>
          )}
          <button className="btn btn-selva" type="submit" disabled={!formOk} style={!formOk ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}>
            {cta}
          </button>
        </form>
      </div>
    </div>
  )
}

// ---- Newsletter ----
export function Newsletter() {
  const { cfg, establecerEmail } = useStore()
  const atelier = (cfg?.diseno || 'selva') === 'atelier'
  const [email, setEmailForm] = useState('')
  const [nombre, setNombre] = useState('')
  const [ok, setOk] = useState(false)
  const [err, setErr] = useState('')
  const enviar = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      await suscribir(email, nombre, 'newsletter')
      establecerEmail?.(email, nombre)
      setOk(true)
    } catch (ex) { setErr(ex.message) }
  }
  return (
    <section className={`news ${atelier ? 'news-atelier' : ''}`}>
      <h2 className="serif news-title">{atelier ? 'Únete a nuestra comunidad' : 'Recibe nuestras ofertas 🌿'}</h2>
      <p className="news-sub">{atelier
        ? 'Suscríbete para recibir noticias, lanzamientos y cuidados de la selva.'
        : 'Suscríbete y entérate de nuevos sabores, promociones y novedades de la selva.'}</p>
      {ok
        ? <div className="news-ok">¡Gracias por suscribirte! 💚</div>
        : <form className="news-form" onSubmit={enviar}>
            {!atelier && <input type="text" placeholder="Tu nombre (opcional)" value={nombre} onChange={e => setNombre(e.target.value)} />}
            <input type="email" placeholder={atelier ? 'Tu correo electrónico' : 'Tu correo'} value={email} onChange={e => setEmailForm(e.target.value)} required />
            <button type="submit"><Send size={16} /> Suscribirme</button>
          </form>}
      {err && <div className="news-err">{err}</div>}
    </section>
  )
}
