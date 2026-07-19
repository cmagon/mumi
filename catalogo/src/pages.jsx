import { useEffect, useMemo, useState, useRef, createContext, useContext } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { Search, X, ArrowLeft, ShoppingCart, MessageCircle, Plus, Minus, Send, Share2, Heart, ZoomIn, ChevronRight, Home as HomeIcon, Play } from 'lucide-react'
import DOMPurify from 'dompurify'
import Lightbox from 'yet-another-react-lightbox'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails'
import 'yet-another-react-lightbox/styles.css'
import 'yet-another-react-lightbox/plugins/thumbnails.css'
import { supabase } from './supabase'
import { useStore } from './store'
import { Card, HeroSlider, Newsletter, BannerSecundario, BannerGrupo } from './ui'
import { fCOP, labelCategoria, getFrutos, iconoDe, iconoFruto, labelFruto, stockLabel, imgsDe, sinTildes, sinHtml, registrarVisita, confirmarPedidoWA, setSEO, compartir, rutaProducto, buscarPorSlug, abrirWA, FAVORITOS, BUSCADOR, videoEmbed, videoThumb, paginaPorSlug, postCanvas } from './utils'
import FrutoIcon from './FrutoIcon'

// ==================== MIGAS DE PAN ====================
function Migas({ items }) {
  return (
    <nav className="migas" aria-label="Migas de pan">
      <Link to="/tienda" className="miga"><HomeIcon size={13} /> Inicio</Link>
      {items.map((it, i) => (
        <span key={i} className="miga-sep">
          <ChevronRight size={13} />
          {it.to ? <Link to={it.to} className="miga">{it.label}</Link> : <span className="miga miga-actual">{it.label}</span>}
        </span>
      ))}
    </nav>
  )
}

// ==================== SECCIÓN MOSAICO (personalizable, tipo "frutos que nos inspiran") ====================
function TileLink({ to, children, title }) {
  const externo = /^https?:\/\//.test(to || '')
  if (!to) return <div className="fruto" title={title}>{children}</div>
  return externo
    ? <a className="fruto" href={to} target="_blank" rel="noreferrer" title={title}>{children}</a>
    : <Link className="fruto" to={to} title={title}>{children}</Link>
}
function Mosaico({ s }) {
  // Compatibilidad: la sección antigua de frutos usa la lista de frutos si no tiene ítems propios
  // Sección "Mis frutos": los ítems provienen de los frutos configurados (cada uno con su link)
  const esFrutos = s.tipo === 'frutos' || s.id === 'frutos'
  let items = Array.isArray(s.items) ? s.items : []
  if (esFrutos) {
    items = getFrutos().map(f => ({ icono: f.icono, foto: f.foto_url, titulo: f.nombre, subtitulo: f.cientifico, color: f.color, link: f.link || '' }))
  }
  if (!items.length) return null
  const titulo = s.titulo || (esFrutos ? 'Los frutos que nos inspiran' : 'Mosaico')
  return (
    <section>
      <div className="sec-head"><h2 className="sec-title serif">{titulo}</h2></div>
      {s.subtitulo && <p style={{ padding: '0 16px', color: 'var(--texto-suave)', marginTop: -4 }}>{s.subtitulo}</p>}
      <div className="frutos">
        {items.map((it, k) => (
          <TileLink key={k} to={it.link} title={it.subtitulo}>
            {it.foto
              ? <div className="fruto-foto"><img src={it.foto} alt={it.titulo} /></div>
              : <div className="fruto-emoji" style={{ color: it.color || 'var(--selva)' }}><FrutoIcon name={it.icono} size={36} /></div>}
            <div className="fruto-name">{it.titulo}</div>{it.subtitulo && <div className="fruto-sci">{it.subtitulo}</div>}
          </TileLink>
        ))}
      </div>
    </section>
  )
}

// ==================== HOME / TIENDA ====================
export function Home() {
  const { cfg, productos, banners, enCarrito, agregar } = useStore()
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  // Los filtros viven en la URL → enlaces compartibles y botón "atrás" funcional
  const cat = sp.get('cat') || 'todos'
  const q = sp.get('q') || ''
  const orden = sp.get('orden') || 'rel'
  const fFruto = sp.get('fruto') || ''
  const setParam = (k, v, def) => setSp(prev => { const n = new URLSearchParams(prev); if (!v || v === def) n.delete(k); else n.set(k, v); return n }, { replace: true })
  const setCat = (v) => setParam('cat', v, 'todos')
  const setQ = (v) => setParam('q', v, '')
  const setOrden = (v) => setParam('orden', v, 'rel')
  const setFFruto = (v) => setParam('fruto', v, '')
  useEffect(() => { registrarVisita(null); setSEO({ title: '', desc: cfg.subtitulo }) }, [cfg.subtitulo])

  const [buscando, setBuscando] = useState(!!q)
  const abrir = (p) => nav(rutaProducto(p))
  const porCategoria = useMemo(() => { const m = {}; (productos || []).forEach(p => { const k = p.categoria || 'otros'; (m[k] ||= []).push(p) }); return m }, [productos])
  const cats = useMemo(() => { const pres = Object.keys(porCategoria); const ord = (cfg.categorias_orden || []).filter(c => pres.includes(c)); return [...ord, ...pres.filter(c => !ord.includes(c)).sort()] }, [porCategoria, cfg.categorias_orden])
  const destacados = useMemo(() => (productos || []).filter(p => p.destacado), [productos])
  const novedades = useMemo(() => (productos || []).filter(p => p.novedad), [productos])

  const filtrando = cat !== 'todos' || !!q.trim() || !!fFruto || orden !== 'rel'
  const heroOn = (cfg.secciones || []).find(s => (s.tipo || s.id) === 'hero')?.on !== false
  const bannersPrincipales = (banners || []).filter(b => !b.es_secundario && b.activo !== false)
  const heroSlides = bannersPrincipales.length ? bannersPrincipales : destacados
  const resultados = useMemo(() => {
    let r = productos || []
    if (cat !== 'todos') r = r.filter(p => (p.categoria || 'otros') === cat)
    if (fFruto) r = r.filter(p => (p.frutos || []).includes(fFruto))
    if (q.trim()) { const nq = sinTildes(q); r = r.filter(p => sinTildes(p.nombre).includes(nq) || sinTildes(sinHtml(p.descripcion)).includes(nq)) }
    const enStock = (p) => (p.stock ?? 0) > 0 ? 1 : 0
    if (orden === 'precio_asc') r = [...r].sort((a, b) => a.precio_detal - b.precio_detal)
    else if (orden === 'precio_desc') r = [...r].sort((a, b) => b.precio_detal - a.precio_detal)
    else if (orden === 'nombre') r = [...r].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    else r = [...r].sort((a, b) => // relevancia: destacados → novedades → con stock → alfabético
      (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0) ||
      (b.novedad ? 1 : 0) - (a.novedad ? 1 : 0) ||
      enStock(b) - enStock(a) ||
      a.nombre.localeCompare(b.nombre, 'es'))
    return r
  }, [productos, cat, fFruto, q, orden])

  if (productos === null) return <div className="spin" />

  const cardProps = (p) => ({ p, cfg, n: enCarrito(p.id), onOpen: () => abrir(p), onAdd: () => agregar(p, 1) })

  return (
    <>
      {/* Banner principal arriba del todo */}
      {heroOn && heroSlides.length > 0 && <HeroSlider slides={heroSlides} onOpen={abrir} />}

      {/* Barra de filtros (debajo del banner) */}
      <div className="toolbar">
        {BUSCADOR && (buscando
          ? <div className="search"><Search size={17} /><input autoFocus placeholder="Buscar producto…" value={q} onChange={e => setQ(e.target.value)} /><button onClick={() => { setQ(''); setBuscando(false) }} aria-label="Cerrar"><X size={16} /></button></div>
          : <button className="search-toggle" onClick={() => setBuscando(true)} aria-label="Buscar"><Search size={18} /> <span>Buscar</span></button>)}
        <select className="sortsel" value={cat} onChange={e => setCat(e.target.value)} aria-label="Categoría">
          <option value="todos">Todas las categorías</option>
          {cats.map(c => <option key={c} value={c}>{labelCategoria(c)}</option>)}
        </select>
        <select className="sortsel" value={orden} onChange={e => setOrden(e.target.value)} aria-label="Ordenar">
          <option value="rel">Relevancia</option><option value="precio_asc">Precio: menor a mayor</option>
          <option value="precio_desc">Precio: mayor a menor</option><option value="nombre">Nombre (A-Z)</option>
        </select>
      </div>
      {cfg.mostrar_filtro_frutos && getFrutos().length > 0 && (
        <div className="chips" style={{ paddingTop: 0 }}>
          <button className={`chip chip-sm ${!fFruto ? 'on' : ''}`} onClick={() => setFFruto('')}>Todos los frutos</button>
          {getFrutos().map(f => <button key={f.id} className={`chip chip-sm ${fFruto === f.id ? 'on' : ''}`} onClick={() => setFFruto(fFruto === f.id ? '' : f.id)}><FrutoIcon name={f.icono} size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />{f.nombre}</button>)}
        </div>
      )}

      {filtrando ? (
        <>
          <Migas items={[{ label: cat !== 'todos' ? labelCategoria(cat) : (q ? `Búsqueda: "${q}"` : 'Resultados') }]} />
          <div className="sec-head">
            <h2 className="sec-title serif">{resultados.length} resultado{resultados.length === 1 ? '' : 's'}</h2>
            <button className="sec-link" onClick={() => { setCat('todos'); setQ(''); setFFruto(''); setOrden('rel') }}>Limpiar filtros ✕</button>
          </div>
          <div className="grid">
            {resultados.length ? resultados.map(p => <Card key={p.id} {...cardProps(p)} />)
              : <p className="empty" style={{ gridColumn: '1 / -1' }}>No encontramos productos. Prueba con otra búsqueda o filtro.</p>}
          </div>
        </>
      ) : (
        (cfg.secciones || []).filter(s => s.on !== false).map((s, idx) => {
          const key = s.key || s.id || idx
          const tipo = s.tipo || s.id   // compatibilidad con el formato antiguo
          const filaCat = (c) => (porCategoria[c]?.length ? (
            <section key={c}>
              <div className="sec-head"><h2 className="sec-title serif">{labelCategoria(c)}</h2></div>
              <div className="row">{porCategoria[c].map(p => <Card key={p.id} {...cardProps(p)} />)}</div>
            </section>
          ) : null)
          switch (tipo) {
            case 'hero': return null   // el banner principal ya se muestra arriba de los filtros
            case 'banner': {
              // Grupo de banners secundarios activos (varias imágenes = slide; una = estático)
              const grupoBanners = (banners || []).filter(b => b.es_secundario && b.activo !== false && ((b.grupo || '').trim() || 'General') === s.grupo)
              if (grupoBanners.length) return <BannerGrupo key={key} banners={grupoBanners} />
              // Compatibilidad con secciones antiguas que referencian un banner por id
              const b = banners.find(x => String(x.id) === String(s.bannerId) && x.activo !== false)
              return b ? <BannerSecundario key={key} b={b} /> : null
            }
            case 'novedades':
              return novedades.length > 0 ? (
                <section key={key}>
                  <div className="sec-head"><h2 className="sec-title serif">{s.titulo || '✨ Novedades'}</h2></div>
                  <div className="row">{novedades.map(p => <Card key={p.id} {...cardProps(p)} />)}</div>
                </section>
              ) : null
            case 'combos': {
              const combos = (productos || []).filter(p => p._tipo === 'combo')
              return combos.length > 0 ? (
                <section key={key}>
                  <div className="sec-head"><h2 className="sec-title serif">{s.titulo || '🎁 Combos'}</h2></div>
                  <div className="row">{combos.map(p => <Card key={p.id} {...cardProps(p)} />)}</div>
                </section>
              ) : null
            }
            case 'categorias':   // todas las categorías (formato antiguo)
              return <div key={key}>{cats.map(filaCat)}</div>
            case 'categoria':    // una categoría específica
              return <div key={key}>{filaCat(s.categoria)}</div>
            case 'mosaico': case 'frutos':   // sección de mosaico personalizable
              return <Mosaico key={key} s={s} />
            case 'newsletter':
              return <Newsletter key={key} />
            default:
              return null
          }
        })
      )}

      <div className="footer-space" />
    </>
  )
}

// ==================== DETALLE DE PRODUCTO ====================
export function Producto() {
  const { id: param } = useParams()
  const nav = useNavigate()
  const { cfg, productos, enCarrito, agregar, esFav, toggleFav, precio, mayorista, enOferta, descuentoPct } = useStore()
  const p = buscarPorSlug(productos, param)
  const [img, setImg] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  useEffect(() => { setImg(0); if (p) { registrarVisita(p.nombre); setSEO({ title: p.nombre, desc: sinHtml(p.descripcion).slice(0, 160), image: p.imagen_url }) } }, [param, p?.nombre])

  if (productos === null) return <div className="spin" />
  if (!p) return <div className="empty">Producto no encontrado. <Link to="/tienda" className="sec-link">Volver a la tienda</Link></div>

  const galeria = imgsDe(p)
  const n = enCarrito(p.id)
  const agotado = (p.stock ?? 0) <= 0
  const st = stockLabel(p.stock, cfg)
  const relacionados = (productos || []).filter(x => x.id !== p.id && x.categoria === p.categoria).slice(0, 8)
  const pedir = () => confirmarPedidoWA([{ ...p, cantidad: Math.max(1, n) }], '', cfg, mayorista, agotado ? cfg.wa_texto_sin_stock : cfg.wa_texto_stock)
  const compartirProd = () => compartir({ title: p.nombre, text: `${p.nombre} — ${fCOP(precio(p))}`, url: window.location.href })
  const fav = esFav(p.id)

  return (
    <div className="prod">
      <Migas items={[{ label: labelCategoria(p.categoria), to: `/tienda?cat=${encodeURIComponent(p.categoria || '')}` }, { label: p.nombre }]} />
      <div style={{ display: 'flex', alignItems: 'center', padding: '4px 16px' }}>
        <button className="volver" style={{ padding: 0 }} onClick={() => nav(-1)}><ArrowLeft size={18} /> Volver</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {FAVORITOS && <button className={`icon-round ${fav ? 'on' : ''}`} onClick={() => toggleFav(p.id)} aria-label="Favorito"><Heart size={18} fill={fav ? 'currentColor' : 'none'} /></button>}
          <button className="icon-round" onClick={compartirProd} aria-label="Compartir"><Share2 size={18} /></button>
        </div>
      </div>
      <div className="prod-grid">
       <div className="prod-media-col">
        <div className="det-media" onClick={() => galeria.length && setLightbox(true)} style={{ cursor: galeria.length ? 'zoom-in' : 'default' }}>
          {galeria.length ? <img src={galeria[img] || galeria[0]} alt={p.nombre} /> : <span className="ph-fruto"><FrutoIcon name={iconoDe(p.frutos)} size={72} /></span>}
          {galeria.length > 0 && <span className="zoom-hint"><ZoomIn size={16} /> Ampliar</span>}
        </div>
        {galeria.length > 1 && <div className="det-thumbs">{galeria.map((u, k) => <button key={u} className={`det-thumb ${k === img ? 'on' : ''}`} onClick={() => setImg(k)}><img src={u} alt="" /></button>)}</div>}
       </div>
       {lightbox && (
        <Lightbox open close={() => setLightbox(false)} index={img} on={{ view: ({ index }) => setImg(index) }}
          slides={galeria.map(u => ({ src: u }))} plugins={[Zoom, Thumbnails]}
          thumbnails={{ position: 'bottom' }} zoom={{ maxZoomPixelRatio: 3 }} />
       )}

      <div className="det-body">
        <div className="det-cat">{labelCategoria(p.categoria)}</div>
        <h1 className="det-name serif">{p.nombre}</h1>
        <div className="det-price">{fCOP(precio(p))}
          {enOferta(p) && <><span className="precio-antes">{fCOP(p.precio_detal)}</span><span className="ribbon ribbon-oferta" style={{ position: 'static', marginLeft: 8 }}>-{descuentoPct(p)}%</span></>}
          {mayorista ? <span className="precio-tag">precio mayorista</span> : (cfg.mostrar_mayor && p.precio_mayor ? <span style={{ fontSize: '0.8rem', color: 'var(--texto-suave)', fontWeight: 400 }}> · Mayor {fCOP(p.precio_mayor)}</span> : null)}
        </div>
        {st && st.tono !== 'ok' && st.tono !== 'agotado' && <div className={`stock-tag stock-${st.tono}`} style={{ alignSelf: 'flex-start' }}>🔥 {st.texto}</div>}
        {/* Propiedades (antes estaban abajo) */}
        {p.beneficios?.length > 0 && <div className="benes">{p.beneficios.map((b, i) => <span key={i} className="bene">{b}</span>)}</div>}
        {p.descripcion && <div className="det-desc rich-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(p.descripcion) }} />}

        {agotado
          ? <div className="agotado-box">Producto agotado por ahora. Escríbenos para avisarte cuando vuelva.</div>
          : <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }}>
              <span style={{ fontWeight: 600, color: 'var(--texto-suave)' }}>Cantidad</span>
              <div className="qty"><button onClick={() => agregar(p, -1)} disabled={n <= 0}><Minus size={18} /></button><span>{Math.max(1, n)}</span><button onClick={() => agregar(p, 1)}><Plus size={18} /></button></div>
            </div>
            <button className="btn btn-selva" onClick={() => { if (n <= 0) agregar(p, 1) }}><ShoppingCart size={18} /> {n > 0 ? `En el pedido (${n})` : 'Agregar al pedido'}</button>
          </>}
        <button className="btn btn-wa" onClick={pedir}><MessageCircle size={18} /> {agotado ? 'Consultar por WhatsApp' : 'Pedir este producto'}</button>

        {/* "Hecho con" abajo, tipo metaetiquetas */}
        {p.frutos?.length > 0 && <div className="det-meta">Hecho con {p.frutos.map((f, i) => <span key={f} className="det-meta-tag"><FrutoIcon name={iconoFruto(f)} size={13} /> {labelFruto(f)}</span>)}</div>}
      </div>
      </div>

      {relacionados.length > 0 && (
        <section>
          <div className="sec-head"><h2 className="sec-title serif">También te puede gustar</h2></div>
          <div className="row">{relacionados.map(r => <Card key={r.id} p={r} cfg={cfg} n={enCarrito(r.id)} onOpen={() => nav(rutaProducto(r))} onAdd={() => agregar(r, 1)} />)}</div>
        </section>
      )}
      <div className="footer-space" />
    </div>
  )
}

// ==================== FAVORITOS ====================
export function Favoritos() {
  const { productos, favs, cfg, enCarrito, agregar } = useStore()
  const nav = useNavigate()
  useEffect(() => { setSEO({ title: 'Favoritos' }) }, [])
  if (productos === null) return <div className="spin" />
  const lista = (productos || []).filter(p => favs.includes(p.id))
  return (
    <div className="page">
      <Migas items={[{ label: 'Favoritos' }]} />
      <div className="sec-head"><h2 className="sec-title serif">❤️ Tus favoritos</h2></div>
      {lista.length
        ? <div className="grid">{lista.map(p => <Card key={p.id} p={p} cfg={cfg} n={enCarrito(p.id)} onOpen={() => nav(rutaProducto(p))} onAdd={() => agregar(p, 1)} />)}</div>
        : <p className="empty">Aún no tienes favoritos. Toca el ❤ en un producto para guardarlo.</p>}
      <div className="footer-space" />
    </div>
  )
}

// ==================== PÁGINAS POR BLOQUES (Nosotros + páginas personalizadas) ====================
// Renderiza un bloque: título, párrafo, imagen, botón, galería (álbum) o video.
const anchoColPct = (a) => { const n = Number(a); return (a === 'auto' || !n) ? undefined : `${Math.max(8, Math.min(100, (n / 12) * 100))}%` }
function BloquePagina({ b, onImg, onAlbum }) {
  const nav = useNavigate()
  // Alineación y ancho configurables (títulos centrados por defecto)
  const align = b.align || (b.tipo === 'titulo' ? 'center' : 'left')
  // Ancho: personalizado (px, arrastrado en el lienzo) o preajuste
  const anchoMax = (b.estilo && b.estilo.maxW) ? b.estilo.maxW : { narrow: 520, medio: 720 }[b.ancho]
  const wrapStyle = { textAlign: align }
  if (anchoMax) {
    wrapStyle.maxWidth = anchoMax
    wrapStyle.marginLeft = (align === 'right' || align === 'center') ? 'auto' : 0
    wrapStyle.marginRight = (align === 'left' || align === 'center') ? 'auto' : 0
  }
  // Panel de estilo (como Elementor): espaciado, fondo, color, radio, tamaño de fuente
  const est = b.estilo || {}
  if (est.bg) wrapStyle.background = est.bg
  if (est.color) wrapStyle.color = est.color
  if (est.padY != null && est.padY !== '') { wrapStyle.paddingTop = Number(est.padY); wrapStyle.paddingBottom = Number(est.padY) }
  if (est.padX != null && est.padX !== '') { wrapStyle.paddingLeft = Number(est.padX); wrapStyle.paddingRight = Number(est.padX) }
  if (est.radio != null && est.radio !== '') wrapStyle.borderRadius = Number(est.radio)
  if (est.fontSize != null && est.fontSize !== '') wrapStyle.fontSize = Number(est.fontSize)
  let contenido = null
  if (b.tipo === 'fila') {
    const cols = Array.isArray(b.columnas) ? b.columnas : []
    contenido = <div className="blk-fila">{cols.map((c, ci) => (
      <div className="blk-col" style={{ flexBasis: anchoColPct(c.ancho), flexGrow: anchoColPct(c.ancho) ? 0 : 1 }} key={ci}>
        {(c.bloques || []).map((cb, bi) => <BloquePagina key={bi} b={cb} onImg={onImg} onAlbum={onAlbum} />)}
      </div>
    ))}</div>
    return <div className="blk" style={wrapStyle}>{contenido}</div>
  }
  if (b.tipo === 'caja') {
    const cajaStyle = { ...wrapStyle }
    if (!cajaStyle.background) cajaStyle.background = '#fff'
    if (cajaStyle.paddingTop == null) { cajaStyle.paddingTop = cajaStyle.paddingBottom = 18 }
    if (cajaStyle.paddingLeft == null) { cajaStyle.paddingLeft = cajaStyle.paddingRight = 18 }
    if (cajaStyle.borderRadius == null) cajaStyle.borderRadius = 14
    return <div className="blk blk-caja" style={cajaStyle}>{(b.bloques || []).map((cb, bi) => <BloquePagina key={bi} b={cb} onImg={onImg} onAlbum={onAlbum} />)}</div>
  }
  if (b.tipo === 'titulo') contenido = <h2 className="serif nos-titulo" style={{ fontSize: b.grande ? '2rem' : undefined }}>{b.texto}</h2>
  else if (b.tipo === 'parrafo') contenido = <div className="rich-content nos-parrafo" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(b.html || b.texto || '') }} />
  else if (b.tipo === 'imagen') contenido = (
    <figure className="nos-imagen">
      {b.url && <img src={b.url} alt={b.pie || ''} loading="lazy" onClick={() => onImg?.(b.url)} style={{ cursor: 'zoom-in' }} />}
      {b.pie && <figcaption>{b.pie}</figcaption>}
    </figure>
  )
  else if (b.tipo === 'boton') {
    if (!b.texto) return null
    const dest = (b.destino || '').trim()
    const externo = /^https?:\/\//.test(dest)
    const jc = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'
    contenido = <div className="nos-boton-wrap" style={{ justifyContent: jc }}>
      {externo
        ? <a className="btn btn-selva nos-boton" href={dest} target="_blank" rel="noreferrer">{b.texto} →</a>
        : <button className="btn btn-selva nos-boton" onClick={() => dest && nav(dest)}>{b.texto} →</button>}
    </div>
  }
  else if (b.tipo === 'video') {
    const src = videoEmbed(b.url)
    if (!src) return null
    contenido = <div className="nos-video-wrap">
      {b.titulo && <h3 className="serif nos-subtitulo">{b.titulo}</h3>}
      <div className="nos-video"><iframe src={src} title={b.titulo || 'video'} loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="no-referrer-when-downgrade" /></div>
    </div>
  }
  else if (b.tipo === 'galeria') {
    const imgs = Array.isArray(b.imagenes) ? b.imagenes.filter(x => x.url) : []
    if (!imgs.length && !b.titulo) return null
    contenido = <div className="nos-album" style={{ textAlign: 'left' }}>
      {b.titulo && <h3 className="serif nos-subtitulo">{b.titulo}</h3>}
      {b.subtitulo && <p className="nos-album-sub">{b.subtitulo}</p>}
      <div className="nos-galeria">
        {imgs.map((im, k) => (
          <figure key={k} className="nos-gitem" onClick={() => onAlbum?.(imgs, k)}>
            <img src={im.url} alt={im.titulo || ''} loading="lazy" />
            {(im.titulo || im.subtitulo) && <figcaption>{im.titulo && <strong>{im.titulo}</strong>}{im.subtitulo && <span>{im.subtitulo}</span>}</figcaption>}
          </figure>
        ))}
      </div>
    </div>
  }
  if (!contenido) return null
  return <div className="blk" style={wrapStyle}>{contenido}</div>
}

// Renderiza una lista de bloques con lightbox integrado (imágenes sueltas y álbumes)
function Bloques({ bloques }) {
  const [lb, setLb] = useState(null)   // { slides:[{src}], index }
  const abrirImg = (url) => setLb({ slides: [{ src: url }], index: 0 })
  const abrirAlbum = (imgs, k) => setLb({ slides: imgs.map(x => ({ src: x.url, title: x.titulo, description: x.subtitulo })), index: k })
  return (
    <>
      {(bloques || []).map((b, i) => <BloquePagina key={i} b={b} onImg={abrirImg} onAlbum={abrirAlbum} />)}
      {lb && <Lightbox open close={() => setLb(null)} index={lb.index} slides={lb.slides} plugins={[Zoom, Thumbnails]} thumbnails={{ position: 'bottom' }} zoom={{ maxZoomPixelRatio: 3 }} />}
    </>
  )
}

// ---- Edición en el lienzo (WYSIWYG) ----
// Elemento editable sin control de React: el contenido se fija al montar y se envía al panel al terminar.
function Editable({ tag = 'div', html = false, initial, className, style, onCommit }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) { if (html) ref.current.innerHTML = initial || ''; else ref.current.textContent = initial || '' } }, []) // solo al montar
  const Tag = tag
  return <Tag ref={ref} className={className} style={style} contentEditable suppressContentEditableWarning
    onBlur={() => onCommit(html ? ref.current.innerHTML : ref.current.textContent)} />
}

const WIDGETS = [['titulo', 'Título', 'T'], ['parrafo', 'Párrafo', '¶'], ['imagen', 'Imagen', '🖼'], ['boton', 'Botón', '⬛'], ['galeria', 'Galería', '▦'], ['video', 'Video', '►'], ['fila', 'Columnas', '▥'], ['caja', 'Caja', '▢']]
export function nuevoBloqueCat(tipo) {
  const N = {
    titulo: { tipo: 'titulo', texto: 'Nuevo título' }, parrafo: { tipo: 'parrafo', html: 'Escribe aquí…' }, imagen: { tipo: 'imagen', url: '', pie: '' },
    boton: { tipo: 'boton', texto: 'Botón', destino: '' }, galeria: { tipo: 'galeria', titulo: '', subtitulo: '', imagenes: [] },
    video: { tipo: 'video', url: '', titulo: '' }, fila: { tipo: 'fila', columnas: [{ ancho: 'auto', bloques: [] }, { ancho: 'auto', bloques: [] }] },
    caja: { tipo: 'caja', bloques: [], estilo: {} },
  }
  return JSON.parse(JSON.stringify(N[tipo] || N.parrafo))
}

// Manija para redimensionar el ancho de una columna arrastrando (snap a rejilla de 12)
function ColResizer({ onSet }) {
  const onDown = (e) => {
    e.preventDefault(); e.stopPropagation()
    const fila = e.currentTarget.closest('.blk-fila'); if (!fila) return
    const rect = fila.getBoundingClientRect()
    const izq = e.currentTarget.previousElementSibling?.getBoundingClientRect().left ?? rect.left
    const move = (ev) => { const frac = Math.max(2, Math.min(11, Math.round(((ev.clientX - izq) / rect.width) * 12))); onSet(frac) }
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); document.body.classList.remove('col-resizing') }
    document.body.classList.add('col-resizing')
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up)
  }
  return <div className="col-resizer" onMouseDown={onDown} title="Arrastra para ajustar el ancho"><span /></div>
}

// ---- Arrastre entre contenedores (rutas) ----
const DnDCtx = createContext(null)
// Navega el árbol hasta el array contenedor de la ruta y devuelve {arr, idx}
function walkParent(tree, ruta) {
  let arr = tree, p = 0
  while (p < ruta.length - 1) {
    const el = arr[ruta[p]]; const key = ruta[p + 1]
    if (key === 'caja') arr = el.bloques || (el.bloques = [])
    else if (key && key.col != null) arr = el.columnas[key.col].bloques || (el.columnas[key.col].bloques = [])
    else break
    p += 2
  }
  return { arr, idx: ruta[ruta.length - 1] }
}
const mismaRuta = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// Editor en el lienzo recursivo: edita bloques, columnas y cajas; permite arrastrar entre contenedores
function BloquesEditable({ bloques, onChange, nivel = 0, ruta = [] }) {
  const [sel, setSel] = useState(null)
  const ctxTop = useContext(DnDCtx)
  // El nivel 0 crea el controlador de arrastre (opera sobre el árbol completo)
  const dnd = ctxTop || {
    _drag: null,
    mover(desde, hacia) {
      const t = JSON.parse(JSON.stringify(bloques))
      const s = walkParent(t, desde); const [blk] = s.arr.splice(s.idx, 1)
      const d = walkParent(t, hacia); let di = d.idx
      if (s.arr === d.arr && di > s.idx) di--
      d.arr.splice(di, 0, blk); onChange(t)
    },
  }
  const setDrag = (path) => { dnd._drag = path }
  const soltarEn = (hacia) => { if (dnd._drag && !mismaRuta(dnd._drag, hacia)) dnd.mover(dnd._drag, hacia); dnd._drag = null }
  const upd = (i, nb) => onChange(bloques.map((b, k) => k === i ? nb : b))
  const updC = (i, campo, val) => upd(i, { ...bloques[i], [campo]: val })
  const del = (i) => { onChange(bloques.filter((_, k) => k !== i)); setSel(null) }
  const mov = (i, d) => { const a = [...bloques]; const j = i + d; if (j < 0 || j >= a.length) return;[a[i], a[j]] = [a[j], a[i]]; onChange(a) }
  const add = (tipo) => { const a = [...bloques]; const nb = nuevoBloqueCat(tipo); if (sel == null) a.push(nb); else a.splice(sel + 1, 0, nb); onChange(a) }
  const anchos = { auto: 'Auto', 3: '1/4', 4: '1/3', 6: '1/2', 8: '2/3', 9: '3/4' }
  const alignActual = (b) => b.align || (b.tipo === 'titulo' ? 'center' : 'left')
  const ciclarAlign = (i, b) => updC(i, 'align', { left: 'center', center: 'right', right: 'left' }[alignActual(b)])
  const ciclarAncho = (i, b) => { const nx = { full: 'medio', medio: 'narrow', narrow: 'full' }[b.ancho || 'full']; const estilo = { ...(b.estilo || {}) }; delete estilo.maxW; upd(i, { ...b, ancho: nx, estilo }) }
  // Redimensionar un bloque arrastrando su borde derecho (ancho en px → estilo.maxW)
  const iniciarResize = (e, i, b) => {
    e.preventDefault(); e.stopPropagation()
    const el = e.currentTarget.closest('.edit-blk'); if (!el) return
    const left = el.getBoundingClientRect().left
    const move = (ev) => { const w = Math.max(120, Math.round(ev.clientX - left)); updC(i, 'estilo', { ...(bloques[i].estilo || {}), maxW: w }) }
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); document.body.classList.remove('col-resizing') }
    document.body.classList.add('col-resizing'); document.addEventListener('mousemove', move); document.addEventListener('mouseup', up)
  }
  const cuerpo = (
    <div>
      {nivel === 0 && (
        <div className="edit-palette">
          <span className="edit-palette-lbl">Agregar:</span>
          {WIDGETS.map(([t, label, ic]) => <button key={t} onClick={() => add(t)} title={label}><span className="edit-w-ic">{ic}</span> {label}</button>)}
        </div>
      )}
      <div className={nivel === 0 ? '' : 'edit-anidado'} onClick={() => { if (nivel === 0) setSel(null) }}>
        {(bloques || []).map((b, i) => (
          <div key={i} className={`edit-blk ${sel === i ? 'sel' : ''}`}
            onClick={(e) => { e.stopPropagation(); setSel(i) }}
            onDragOver={(e) => { if (dnd._drag) { e.preventDefault(); e.currentTarget.classList.add('over') } }}
            onDragLeave={(e) => e.currentTarget.classList.remove('over')}
            onDrop={(e) => { e.stopPropagation(); e.currentTarget.classList.remove('over'); soltarEn([...ruta, i]) }}>
            {sel === i && (
              <div className="edit-tool" onClick={e => e.stopPropagation()}>
                <span className="edit-grip" draggable onDragStart={(e) => { try { e.dataTransfer.setData('text/plain', 'mumi'); e.dataTransfer.effectAllowed = 'move' } catch { /* noop */ } setDrag([...ruta, i]) }} onDragEnd={() => { dnd._drag = null }} title="Arrastra para mover (a cajas y columnas)">⠿</span>
                <span className="edit-tool-tipo">{b.tipo}</span>
                <button onClick={() => ciclarAlign(i, b)} title="Alinear">{{ left: '⯇', center: '≡', right: '⯈' }[alignActual(b)]}</button>
                <button onClick={() => ciclarAncho(i, b)} title="Ancho (estrecho/medio/completo)">⇔</button>
                {b.tipo === 'caja' && <button onClick={() => updC(i, 'bloques', [...(b.bloques || []), nuevoBloqueCat('parrafo')])} title="Agregar dentro">＋</button>}
                <button disabled={i === 0} onClick={() => mov(i, -1)} title="Subir">↑</button>
                <button disabled={i === bloques.length - 1} onClick={() => mov(i, 1)} title="Bajar">↓</button>
                <button onClick={() => del(i)} title="Borrar">🗑</button>
              </div>
            )}
            {sel === i && <span className="edit-resize" onMouseDown={(e) => iniciarResize(e, i, b)} title="Arrastra para cambiar el ancho" />}
            {b.tipo === 'titulo'
              ? <Editable tag="h2" className="serif nos-titulo" style={{ textAlign: b.align || 'center' }} initial={b.texto} onCommit={(val) => updC(i, 'texto', val)} />
              : b.tipo === 'parrafo'
                ? <Editable html className="rich-content nos-parrafo" initial={b.html || b.texto} onCommit={(val) => updC(i, 'html', val)} />
                : b.tipo === 'boton'
                  ? <div className="nos-boton-wrap"><Editable tag="span" className="btn btn-selva nos-boton" initial={b.texto} onCommit={(val) => updC(i, 'texto', val)} /></div>
                  : b.tipo === 'caja'
                    ? <div className="blk-caja edit-caja"
                        onDragOver={(e) => { if (dnd._drag) { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add('caja-over') } }}
                        onDragLeave={(e) => e.currentTarget.classList.remove('caja-over')}
                        onDrop={(e) => { e.stopPropagation(); e.currentTarget.classList.remove('caja-over'); soltarEn([...ruta, i, 'caja', (b.bloques || []).length]) }}>
                        <div className="edit-caja-lbl">Caja — suelta elementos aquí</div>
                        <BloquesEditable bloques={b.bloques || []} onChange={(nb) => updC(i, 'bloques', nb)} nivel={nivel + 1} ruta={[...ruta, i, 'caja']} />
                      </div>
                    : b.tipo === 'fila'
                      ? <div className="blk-fila">{(b.columnas || []).map((c, ci) => (
                          <div className="blk-col edit-col" key={ci} style={{ flexBasis: c.ancho && c.ancho !== 'auto' ? `${(Number(c.ancho) / 12) * 100}%` : undefined, flexGrow: c.ancho && c.ancho !== 'auto' ? 0 : 1 }}
                            onDragOver={(e) => { if (dnd._drag) { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add('col-over') } }}
                            onDragLeave={(e) => e.currentTarget.classList.remove('col-over')}
                            onDrop={(e) => { e.stopPropagation(); e.currentTarget.classList.remove('col-over'); soltarEn([...ruta, i, { col: ci }, (c.bloques || []).length]) }}>
                            <div className="edit-col-head" onClick={e => e.stopPropagation()}>
                              <span>Col {ci + 1}</span>
                              <select value={c.ancho || 'auto'} onChange={e => updC(i, 'columnas', b.columnas.map((x, k) => k === ci ? { ...x, ancho: e.target.value } : x))}>
                                {Object.entries(anchos).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                              </select>
                              {b.columnas.length > 1 && <button onClick={() => updC(i, 'columnas', b.columnas.filter((_, k) => k !== ci))} title="Quitar columna">✕</button>}
                            </div>
                            <BloquesEditable bloques={c.bloques || []} onChange={(nb) => updC(i, 'columnas', b.columnas.map((x, k) => k === ci ? { ...x, bloques: nb } : x))} nivel={nivel + 1} ruta={[...ruta, i, { col: ci }]} />
                            {ci < b.columnas.length - 1 && <ColResizer onSet={(frac) => updC(i, 'columnas', b.columnas.map((x, k) => k === ci ? { ...x, ancho: String(frac) } : x))} />}
                          </div>
                        ))}
                          {b.columnas.length < 4 && <button className="edit-addcol" onClick={(e) => { e.stopPropagation(); updC(i, 'columnas', [...b.columnas, { ancho: 'auto', bloques: [] }]) }}>＋ col</button>}
                        </div>
                        : <div style={{ pointerEvents: 'none' }}><BloquePagina b={b} /></div>}
          </div>
        ))}
        {nivel > 0 && <button className="edit-add-inline" onClick={(e) => { e.stopPropagation(); add('parrafo') }}>＋ agregar elemento</button>}
        {nivel === 0 && (!bloques || bloques.length === 0) && <p className="empty">Usa la barra de arriba para agregar tu primer bloque.</p>}
      </div>
    </div>
  )
  return nivel === 0 ? <DnDCtx.Provider value={dnd}>{cuerpo}</DnDCtx.Provider> : cuerpo
}

export function Nosotros() {
  const { cfg, edicion } = useStore()
  useEffect(() => { setSEO({ title: 'Nosotros', desc: sinHtml(cfg.nosotros_texto).slice(0, 160) || 'Sabores artesanales de la selva.' }) }, [cfg.nosotros_texto])
  const editando = edicion?.on && edicion.target === 'nosotros'
  const bloques = Array.isArray(cfg.nosotros_bloques) && cfg.nosotros_bloques.length
    ? cfg.nosotros_bloques
    : (cfg.nosotros_texto ? [{ tipo: 'parrafo', html: cfg.nosotros_texto }] : [])
  return (
    <div className="page">
      <Migas items={[{ label: 'Nosotros' }]} />
      <div className="nos-cuerpo">{editando ? <BloquesEditable bloques={bloques} onChange={(nb) => postCanvas({ type: 'mumi-canvas-set', target: 'nosotros', bloques: nb })} /> : <Bloques bloques={bloques} />}</div>
      <div className="footer-space" />
    </div>
  )
}

// ==================== PÁGINA PERSONALIZADA (/p/:slug) ====================
export function Pagina() {
  const { slug } = useParams()
  const { cfg, edicion } = useStore()
  const pag = paginaPorSlug(cfg.paginas, slug)
  const editando = edicion?.on && edicion.target === `pagina:${slug}`
  useEffect(() => { if (pag) setSEO({ title: pag.titulo }) }, [pag?.titulo])
  if (cfg.paginas == null) return <div className="spin" />
  if (!pag) return <div className="empty">Página no encontrada. <Link to="/tienda" className="sec-link">Volver a la tienda</Link></div>
  return (
    <div className="page">
      <Migas items={[{ label: pag.titulo }]} />
      {pag.titulo && <div style={{ padding: '8px 16px 0' }}><h1 className="serif" style={{ fontSize: '1.7rem', color: 'var(--selva)' }}>{pag.titulo}</h1></div>}
      <div className="nos-cuerpo">{editando
        ? <BloquesEditable bloques={pag.bloques || []} onChange={(nb) => postCanvas({ type: 'mumi-canvas-set', target: `pagina:${slug}`, bloques: nb })} />
        : <Bloques bloques={pag.bloques || []} />}</div>
      <div className="footer-space" />
    </div>
  )
}

// ==================== MAYORISTA (puerta de acceso) ====================
export function Mayorista() {
  const { cfg, setMayorista, mayorista } = useStore()
  const nav = useNavigate()
  const [clave, setClave] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => { setSEO({ title: 'Acceso mayorista' }) }, [])
  const entrar = (e) => {
    e?.preventDefault()
    const req = (cfg.mayorista_clave || '').trim()
    if (req && clave.trim() !== req) { setErr('Clave incorrecta. Escríbenos por WhatsApp para obtenerla.'); return }
    setMayorista(true); nav('/tienda')
  }
  return (
    <div className="page" style={{ maxWidth: 460, margin: '0 auto', padding: '24px 16px 40px' }}>
      <Migas items={[{ label: 'Acceso mayorista' }]} />
      <div className="mayo-gate">
        <div className="mayo-gate-ico">🏷️</div>
        <h1 className="serif" style={{ fontSize: '1.6rem', color: 'var(--selva)' }}>Zona mayorista</h1>
        <p style={{ color: 'var(--texto-suave)', margin: '8px 0 16px' }}>Ingresa para ver los <strong>precios al por mayor</strong> en todo el catálogo.</p>
        {mayorista
          ? <><div className="news-ok" style={{ background: 'rgba(124,179,66,0.15)', color: 'var(--selva)' }}>Ya tienes activo el modo mayorista ✓</div>
              <button className="btn btn-selva" style={{ marginTop: 12 }} onClick={() => nav('/tienda')}>Ir a la tienda</button></>
          : <form onSubmit={entrar} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(cfg.mayorista_clave || '').trim() && <input className="cf" type="password" placeholder="Clave de mayorista" value={clave} onChange={e => { setClave(e.target.value); setErr('') }} autoFocus />}
              <button className="btn btn-selva" type="submit">Entrar</button>
              {err && <div className="news-err" style={{ color: 'var(--rojo)' }}>{err}</div>}
              <button type="button" className="btn btn-wa" onClick={() => abrirWA(cfg, cfg.mayorista_wa_texto || 'Hola, quiero acceder a la zona mayorista.')}><MessageCircle size={18} /> Solicitar acceso por WhatsApp</button>
            </form>}
      </div>
      <div className="footer-space" />
    </div>
  )
}

// ==================== GALERÍA (tipo Pinterest, álbumes de fotos y videos) ====================
const albumCovers = (al) => (al.items || []).map(it => it.tipo === 'video'
  ? { tipo: 'video', url: it.url, thumb: videoThumb(it.url) }
  : { tipo: 'imagen', url: it.url }).filter(x => x.url)

// Portada estilo Facebook: primeras 4 imágenes con overlay +N
function AlbumCover({ al, onOpen }) {
  const covers = albumCovers(al)
  const vis = covers.slice(0, 4)
  const extra = covers.length - vis.length
  return (
    <button className={`alb alb-${al.tamano || 'md'}`} onClick={onOpen}>
      <div className={`alb-cover cover-${Math.min(vis.length, 4)}`}>
        {vis.map((c, k) => (
          <div className="alb-cell" key={k}>
            {c.tipo === 'video'
              ? (c.thumb ? <img src={c.thumb} alt="" loading="lazy" /> : <div className="alb-vid-ph" />)
              : <img src={c.url} alt="" loading="lazy" />}
            {c.tipo === 'video' && <span className="alb-play"><Play size={18} fill="currentColor" /></span>}
            {k === 3 && extra > 0 && <span className="alb-mas">+{extra}</span>}
          </div>
        ))}
        {vis.length === 0 && <div className="alb-cell alb-vacio">Álbum vacío</div>}
      </div>
      {(al.titulo || al.subtitulo) && <div className="alb-info">
        {al.titulo && <div className="alb-titulo">{al.titulo}</div>}
        {al.subtitulo && <div className="alb-sub">{al.subtitulo}</div>}
        <div className="alb-count">{covers.length} elemento{covers.length === 1 ? '' : 's'}</div>
      </div>}
    </button>
  )
}

// Modal que muestra todo el álbum (imágenes + videos)
function AlbumModal({ al, onClose }) {
  const { cfg } = useStore()
  const [lb, setLb] = useState(null)
  const items = (al.items || []).filter(it => it.url)
  const imgs = items.filter(it => it.tipo !== 'video')
  const abrir = (url) => { const idx = imgs.findIndex(x => x.url === url); setLb({ slides: imgs.map(x => ({ src: x.url })), index: Math.max(0, idx) }) }
  const compartirAlbum = () => { const base = (cfg.url_publica || window.location.origin).replace(/\/+$/, ''); compartir({ title: al.titulo || 'Álbum', text: al.subtitulo || '', url: `${base}/galeria/${al.id}` }) }
  return (
    <div className="overlay" style={{ alignItems: 'flex-start' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" style={{ maxWidth: 940 }}>
        <div className="sheet-hd"><button className="iconbtn" onClick={onClose}><ArrowLeft size={20} /></button><span className="serif" style={{ flex: 1 }}>{al.titulo || 'Álbum'}</span><button className="iconbtn" onClick={compartirAlbum} title="Compartir álbum"><Share2 size={18} /></button></div>
        {al.subtitulo && <p style={{ padding: '4px 16px 0', color: 'var(--texto-suave)' }}>{al.subtitulo}</p>}
        <div className="alb-masonry" style={{ padding: 16 }}>
          {items.map((it, k) => it.tipo === 'video'
            ? <div className="alb-m-item" key={k}><div className="nos-video"><iframe src={videoEmbed(it.url)} title="video" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="no-referrer-when-downgrade" /></div></div>
            : <div className="alb-m-item" key={k}><img src={it.url} alt="" loading="lazy" onClick={() => abrir(it.url)} style={{ cursor: 'zoom-in', width: '100%', borderRadius: 10, display: 'block' }} /></div>)}
        </div>
      </div>
      {lb && <Lightbox open close={() => setLb(null)} index={lb.index} slides={lb.slides} plugins={[Zoom, Thumbnails]} thumbnails={{ position: 'bottom' }} zoom={{ maxZoomPixelRatio: 3 }} />}
    </div>
  )
}

export function Galeria() {
  const { cfg } = useStore()
  const { albumId } = useParams()
  const nav = useNavigate()
  useEffect(() => { setSEO({ title: cfg.galeria_titulo || 'Galería' }) }, [cfg.galeria_titulo])
  const albumes = Array.isArray(cfg.galeria_albumes) ? cfg.galeria_albumes.filter(a => (a.items || []).length || a.titulo) : []
  const abierto = albumId ? albumes.find(a => String(a.id) === String(albumId)) : null
  return (
    <div className="page">
      <Migas items={[{ label: cfg.galeria_titulo || 'Galería' }]} />
      <div style={{ padding: '10px 16px 4px' }}>
        <h1 className="serif" style={{ fontSize: '1.7rem', color: 'var(--selva)' }}>{cfg.galeria_titulo || 'Galería'}</h1>
        {cfg.galeria_subtitulo && <p style={{ color: 'var(--texto-suave)', marginTop: 6 }}>{cfg.galeria_subtitulo}</p>}
      </div>
      {albumes.length === 0
        ? <p className="empty">Aún no hay álbumes.</p>
        : <div className="alb-masonry" style={{ padding: '10px 16px' }}>
            {albumes.map((al, i) => <AlbumCover key={al.id || i} al={al} onOpen={() => nav(`/galeria/${al.id}`)} />)}
          </div>}
      {abierto && <AlbumModal al={abierto} onClose={() => nav('/galeria')} />}
      <div className="footer-space" />
    </div>
  )
}

// ==================== CONTACTO ====================
export function Contacto() {
  const { cfg } = useStore()
  useEffect(() => { setSEO({ title: 'Contacto' }) }, [])
  const [f, setF] = useState({ nombre: '', email: '', telefono: '', mensaje: '' })
  const [ok, setOk] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const enviar = async (e) => {
    e.preventDefault(); setErr('')
    if (!f.mensaje.trim()) { setErr('Escribe tu mensaje'); return }
    try { await supabase.from('mensajes_catalogo').insert({ nombre: f.nombre || null, email: f.email || null, telefono: f.telefono || null, mensaje: f.mensaje.trim() }); setOk(true) }
    catch (ex) { setErr(ex.message) }
  }
  const wa = (cfg?.whatsapp || '+573157702180').replace(/[^0-9]/g, '')
  return (
    <div className="page" style={{ padding: '0 0 40px' }}>
      <Migas items={[{ label: 'Contacto' }]} />
      <div style={{ padding: '0 16px' }}>
      <h1 className="serif" style={{ fontSize: '1.7rem', color: 'var(--selva)' }}>Contáctanos</h1>
      <p style={{ color: 'var(--texto-suave)', margin: '6px 0 16px' }}>¿Preguntas, pedidos al por mayor o alianzas? Escríbenos.</p>
      <a className="btn btn-wa" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={{ marginBottom: 16 }}><MessageCircle size={18} /> Escribir por WhatsApp</a>
      {ok
        ? <div className="news-ok" style={{ color: 'var(--selva)', background: 'rgba(124,179,66,0.15)' }}>¡Gracias! Recibimos tu mensaje. 💚</div>
        : <form onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input className="cf" placeholder="Nombre" value={f.nombre} onChange={e => set('nombre', e.target.value)} />
            <input className="cf" type="email" placeholder="Correo" value={f.email} onChange={e => set('email', e.target.value)} />
            <input className="cf" placeholder="Teléfono" value={f.telefono} onChange={e => set('telefono', e.target.value)} />
            <textarea className="cf" rows={4} placeholder="Tu mensaje" value={f.mensaje} onChange={e => set('mensaje', e.target.value)} />
            <button className="btn btn-selva" type="submit"><Send size={17} /> Enviar mensaje</button>
            {err && <div className="news-err" style={{ color: 'var(--rojo)' }}>{err}</div>}
          </form>}
      {cfg.contacto_mapa && <div className="nos-mapa" style={{ marginTop: 18 }}><iframe src={cfg.contacto_mapa} title="Ubicación" loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade" /></div>}
      </div>
      <div className="footer-space" />
    </div>
  )
}
