import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ChevronLeft, ChevronRight, Send, Heart } from 'lucide-react'
import { fCOP, labelCategoria, iconoDe, stockLabel, suscribir, FAVORITOS } from './utils'
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
  return (
    <div className="card">
      <div className="card-media" onClick={onOpen}>
        {p.imagen_url ? <img src={p.imagen_url} alt={p.nombre} /> : <span className="ph-fruto"><FrutoIcon name={iconoDe(p.frutos)} size={44} /></span>}
        {oferta && <span className="ribbon ribbon-oferta">-{descuentoPct(p)}%</span>}
        {p.novedad && !oferta && <span className="ribbon ribbon-nuevo">Nuevo</span>}
        {agotado && <span className="ribbon ribbon-agotado">Agotado</span>}
        {FAVORITOS && <button className={`fav-btn ${fav ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); toggleFav(p.id) }} aria-label="Favorito"><Heart size={17} fill={fav ? 'currentColor' : 'none'} /></button>}
      </div>
      <div className="card-body">
        <div className="card-name" onClick={onOpen}>{p.nombre}</div>
        {st && (st.tono === 'urgente' || st.tono === 'pocas') && <div className={`stock-tag stock-${st.tono}`}>🔥 {st.texto}</div>}
        <div className="card-price">{fCOP(precio(p))}{oferta && <span className="precio-antes">{fCOP(p.precio_detal)}</span>}{mayorista && p.precio_mayor > 0 && <span className="precio-tag">mayor</span>}</div>
        {agotado
          ? <button className="card-add card-add-off" disabled>Agotado</button>
          : <button className="card-add" onClick={onAdd}><Plus size={15} /> {n > 0 ? `Agregar (${n})` : 'Agregar'}</button>}
      </div>
    </div>
  )
}

// ---- Hero slider (soporta BANNERS [imagen/YouTube] y productos destacados) ----
export function HeroSlider({ slides, onOpen }) {
  const { precio } = useStore()
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

  const onClick = () => { if (esBanner) { if (s.boton_link) window.location.href = s.boton_link } else onOpen(s) }

  return (
    <div className="hero" onClick={onClick} style={{ cursor: (esBanner && !s.boton_link) ? 'default' : 'pointer' }}>
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
  const yt = b.tipo === 'youtube' ? ytId(b.youtube) : ''
  const clickable = !!b.boton_link
  const onClick = () => { if (b.boton_link) window.location.href = b.boton_link }
  return (
    <div className="bsec" onClick={onClick} style={{ cursor: clickable ? 'pointer' : 'default' }}>
      {yt
        ? <iframe className="bsec-media" src={`https://www.youtube.com/embed/${yt}?autoplay=1&mute=1&loop=1&playlist=${yt}&controls=0&modestbranding=1&playsinline=1`} title={b.titulo || 'video'} allow="autoplay; encrypted-media" frameBorder="0" />
        : (b.imagen_url ? <img className="bsec-media" src={b.imagen_url} alt={b.titulo || ''} /> : <div className="bsec-media bsec-ph" />)}
      <div className="bsec-overlay">
        {b.titulo && <div className="bsec-title serif">{b.titulo}</div>}
        {b.subtitulo && <div className="bsec-sub">{b.subtitulo}</div>}
        {b.boton_texto && <span className="bsec-btn">{b.boton_texto}</span>}
      </div>
    </div>
  )
}

// ---- Newsletter ----
export function Newsletter() {
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [ok, setOk] = useState(false)
  const [err, setErr] = useState('')
  const enviar = async (e) => { e.preventDefault(); setErr(''); try { await suscribir(email, nombre); setOk(true) } catch (ex) { setErr(ex.message) } }
  return (
    <section className="news">
      <h2 className="serif news-title">Recibe nuestras ofertas 🌿</h2>
      <p className="news-sub">Suscríbete y entérate de nuevos sabores, promociones y novedades de la selva.</p>
      {ok
        ? <div className="news-ok">¡Gracias por suscribirte! 💚</div>
        : <form className="news-form" onSubmit={enviar}>
            <input type="text" placeholder="Tu nombre (opcional)" value={nombre} onChange={e => setNombre(e.target.value)} />
            <input type="email" placeholder="Tu correo" value={email} onChange={e => setEmail(e.target.value)} required />
            <button type="submit"><Send size={16} /> Suscribirme</button>
          </form>}
      {err && <div className="news-err">{err}</div>}
    </section>
  )
}
