import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSwipeable } from 'react-swipeable'
import { Plus, ChevronLeft, ChevronRight, Send, Heart, X, MessageCircle } from 'lucide-react'
import { fCOP, labelCategoria, iconoDe, stockLabel, suscribir, FAVORITOS, imgsDe, imgSrc } from './utils'
import FrutoIcon from './FrutoIcon'
import { useStore } from './store'

// Extrae el ID de un video de YouTube desde varias formas de URL
export function ytId(u) {
  if (!u) return ''
  const m = String(u).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/)
  return m ? m[1] : (/^[\w-]{11}$/.test(u) ? u : '')
}

// ---- Tarjeta de producto ----
export function Card({ p, cfg, n = 0, onOpen, onAdd }) {
  const { esFav, toggleFav, precio, mayorista, enOferta, descuentoPct } = useStore()
  const agotado = (p.stock ?? 0) <= 0
  const st = stockLabel(p.stock, cfg)
  const fav = esFav(p.id)
  const oferta = enOferta(p)
  const atelier = (cfg?.diseno || 'selva') === 'atelier'
  const portada = imgsDe(p)[0]
  const srcWeb = imgSrc(portada || p.imagen_url, false)
  const srcMob = imgSrc(portada || p.imagen_url, true)
  const meta = [p.contenido, p.origen].filter(Boolean).join(' · ')
  const addBtn = agotado
    ? <button type="button" className="card-add card-add-off" disabled aria-label="Agotado">{atelier ? <Plus size={18} /> : 'Agotado'}</button>
    : <button type="button" className="card-add" onClick={(e) => { e.stopPropagation(); onAdd() }} aria-label="Agregar">
        <Plus size={atelier ? 18 : 15} /> {atelier ? (n > 0 ? `${n}` : '') : (n > 0 ? `Agregar (${n})` : 'Agregar')}
      </button>
  return (
    <div className={`card ${atelier ? 'card-atelier' : ''}`}>
      <div className="card-media" onClick={onOpen}>
        {srcWeb
          ? <picture>
              {srcMob && srcMob !== srcWeb ? <source media="(max-width: 700px)" srcSet={srcMob} /> : null}
              <img src={srcWeb} alt={p.nombre} />
            </picture>
          : <span className="ph-fruto"><FrutoIcon name={iconoDe(p.frutos)} size={44} /></span>}
        {oferta && <span className="ribbon ribbon-oferta">{atelier ? 'Oferta' : `-${descuentoPct(p)}%`}</span>}
        {p.novedad && !oferta && <span className="ribbon ribbon-nuevo">Nuevo</span>}
        {agotado && <span className="ribbon ribbon-agotado">Agotado</span>}
        {FAVORITOS && <button type="button" className={`fav-btn ${fav ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); toggleFav(p.id) }} aria-label="Favorito"><Heart size={17} fill={fav ? 'currentColor' : 'none'} /></button>}
        {atelier && addBtn}
      </div>
      <div className="card-body">
        {atelier ? (
          <>
            <div className="card-row">
              <button type="button" className="card-name" onClick={onOpen}>{p.nombre}</button>
              <div className="card-price">{fCOP(precio(p))}{oferta && <span className="precio-antes">{fCOP(p.precio_detal)}</span>}</div>
            </div>
            {meta ? <div className="card-meta">{meta}</div> : null}
            {st && (st.tono === 'urgente' || st.tono === 'pocas') && <div className={`stock-tag stock-${st.tono}`}>🔥 {st.texto}</div>}
            <button type="button" className={`card-add card-add-desk ${agotado ? 'card-add-off' : ''}`} disabled={agotado}
              onClick={(e) => { e.stopPropagation(); if (!agotado) onAdd() }}>
              <Plus size={14} /> {agotado ? 'Agotado' : (n > 0 ? `Añadir (${n})` : 'Añadir')}
            </button>
          </>
        ) : (
          <>
            <div className="card-name" onClick={onOpen}>{p.nombre}</div>
            {st && (st.tono === 'urgente' || st.tono === 'pocas') && <div className={`stock-tag stock-${st.tono}`}>🔥 {st.texto}</div>}
            <div className="card-price">{fCOP(precio(p))}{oferta && <span className="precio-antes">{fCOP(p.precio_detal)}</span>}{mayorista && p.precio_mayor > 0 && <span className="precio-tag">mayor</span>}</div>
            {addBtn}
          </>
        )}
      </div>
    </div>
  )
}

// ---- Hero de marca (Atelier / Munay-style): no usa productos como banner ----
export function BrandHero({ cfg, banner }) {
  const nav = useNavigate()
  const img = banner?.imagen_url || ''
  const yt = banner?.tipo === 'youtube' ? ytId(banner.youtube) : ''
  const title = (banner?.titulo || cfg.titulo_banner || 'Sabiduría de la selva, en cada sorbo.').trim()
  const sub = (banner?.subtitulo || cfg.subtitulo || cfg.slogan || 'Infusiones y superalimentos de frutos amazónicos, cultivados con respeto por la tierra y las comunidades.').trim()
  const cta = (banner?.boton_texto || 'Explorar catálogo').trim()
  const link = (banner?.boton_link || '/tienda').trim()
  const tieneNosotros = !!(cfg?.nosotros_texto?.trim() || (Array.isArray(cfg?.nosotros_bloques) && cfg.nosotros_bloques.length))
  return (
    <section className="brand-hero" aria-label="Portada">
      <div className="brand-hero-media">
        {yt
          ? <iframe className="brand-hero-img" src={`https://www.youtube.com/embed/${yt}?autoplay=1&mute=1&loop=1&playlist=${yt}&controls=0&modestbranding=1&playsinline=1`} title={title} allow="autoplay; encrypted-media" />
          : (img
            ? <img className="brand-hero-img" src={img} alt="" />
            : <div className="brand-hero-ph" aria-hidden />)}
      </div>
      <div className="brand-hero-overlay">
        <div className="brand-hero-copy">
          <h1 className="serif brand-hero-title">{title}</h1>
          {sub && <p className="brand-hero-sub">{sub}</p>}
          <div className="brand-hero-ctas">
            <button type="button" className="btn btn-selva" onClick={() => irEnlace(nav, link)}>{cta}</button>
            {tieneNosotros && <Link to="/nosotros" className="btn btn-ghost brand-hero-ghost">Nuestra historia</Link>}
          </div>
        </div>
      </div>
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
          <Link to="/nosotros" className="impacto-link">Conoce más <ChevronRight size={16} /></Link>
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
  const esBanner = !!s.tipo
  const yt = esBanner && s.tipo === 'youtube' ? ytId(s.youtube) : ''

  const contenido = esBanner ? (
    <>
      {yt
        ? <iframe className="hero-yt" src={`https://www.youtube.com/embed/${yt}?autoplay=1&mute=1&loop=1&playlist=${yt}&controls=0&modestbranding=1&playsinline=1`} title={s.titulo || 'video'} allow="autoplay; encrypted-media" frameBorder="0" />
        : (s.imagen_url ? <img className="hero-img" src={s.imagen_url} alt={s.titulo || ''} /> : <div className="hero-emoji"><FrutoIcon name="hoja" size={90} /></div>)}
      {(s.titulo || s.subtitulo || s.boton_texto) && (
        <div className="hero-body">
          {s.titulo && <div className="hero-name serif">{s.titulo}</div>}
          {s.subtitulo && <div style={{ opacity: 0.9, marginTop: 4 }}>{s.subtitulo}</div>}
          {s.boton_texto && <span className="hero-cta">{s.boton_texto} →</span>}
        </div>
      )}
    </>
  ) : (
    <>
      {s.imagen_url ? <img className="hero-img" src={s.imagen_url} alt={s.nombre} /> : <div className="hero-emoji"><FrutoIcon name={iconoDe(s.frutos)} size={90} /></div>}
      <div className="hero-body">
        <div className="hero-cat">{labelCategoria(s.categoria)}</div>
        <div className="hero-name serif">{s.nombre}</div>
        <div className="hero-price">{fCOP(precio(s))}</div>
        <span className="hero-cta">Ver producto →</span>
      </div>
    </>
  )

  const onClick = () => { if (esBanner) irEnlace(nav, s.boton_link); else onOpen(s) }
  // Deslizar en pantallas táctiles para cambiar de slide
  const swipe = useSwipeable({ onSwipedLeft: () => n > 1 && go(1), onSwipedRight: () => n > 1 && go(-1), preventScrollOnSwipe: true, trackTouch: true, trackMouse: false, delta: 30 })

  return (
    <div className="hero" {...swipe} onClick={onClick} style={{ cursor: (esBanner && !s.boton_link) ? 'default' : 'pointer', touchAction: n > 1 ? 'pan-y' : undefined }}>
      {contenido}
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
  // Sin textos ni botón: la imagen se muestra a full color, sin oscurecer ni overlay
  const conTexto = !!(b.titulo || b.subtitulo || b.boton_texto)
  return (
    <div className={`bsec ${conTexto ? '' : 'bsec-limpio'}`} onClick={onClick} style={{ cursor: clickable ? 'pointer' : 'default' }}>
      {yt
        ? <iframe className="bsec-media" src={`https://www.youtube.com/embed/${yt}?autoplay=1&mute=1&loop=1&playlist=${yt}&controls=0&modestbranding=1&playsinline=1`} title={b.titulo || 'video'} allow="autoplay; encrypted-media" frameBorder="0" />
        : (b.imagen_url ? <img className="bsec-media" src={b.imagen_url} alt={b.titulo || ''} /> : <div className="bsec-media bsec-ph" />)}
      {conTexto && (
        <div className="bsec-overlay">
          {b.titulo && <div className="bsec-title serif">{b.titulo}</div>}
          {b.subtitulo && <div className="bsec-sub">{b.subtitulo}</div>}
          {b.boton_texto && <span className="bsec-btn">{b.boton_texto}</span>}
        </div>
      )}
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

// ---- Newsletter ----
export function Newsletter() {
  const { cfg } = useStore()
  const atelier = (cfg?.diseno || 'selva') === 'atelier'
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [ok, setOk] = useState(false)
  const [err, setErr] = useState('')
  const enviar = async (e) => { e.preventDefault(); setErr(''); try { await suscribir(email, nombre); setOk(true) } catch (ex) { setErr(ex.message) } }
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
            <input type="email" placeholder={atelier ? 'Tu correo electrónico' : 'Tu correo'} value={email} onChange={e => setEmail(e.target.value)} required />
            <button type="submit"><Send size={16} /> Suscribirme</button>
          </form>}
      {err && <div className="news-err">{err}</div>}
    </section>
  )
}
