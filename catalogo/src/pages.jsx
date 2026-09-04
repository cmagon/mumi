import { useEffect, useMemo, useState, useRef, createContext, useContext } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { Search, X, ArrowLeft, ShoppingCart, MessageCircle, Plus, Minus, Send, Share2, Heart, ZoomIn, ChevronRight, Home as HomeIcon, Play, Truck, Leaf, Droplets, BadgeCheck, Star } from 'lucide-react'
import DOMPurify from 'dompurify'
import { useSwipeable } from 'react-swipeable'
import Lightbox from 'yet-another-react-lightbox'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails'
import 'yet-another-react-lightbox/styles.css'
import 'yet-another-react-lightbox/plugins/thumbnails.css'
import { supabase } from './supabase'
import { useStore } from './store'
import { Card, HeroSlider, BrandHero, Impacto, BannerGrupo, Newsletter, ModalNombre, ModalSesionCliente } from './ui'
import { fCOP, labelCategoria, getFrutos, iconoDe, iconoFruto, labelFruto, stockLabel, imgsDe, imgSrc, altImg, textoEnvio, sinTildes, sinHtml, registrarVisita, confirmarPedidoWA, setSEO, compartir, rutaProducto, buscarPorSlug, abrirWA, mensajeSolicitudMayorista, getCliente, setCliente, getEmail, getTelefono, emailValido, telefonoValido, desuscribirPorToken, sincronizarFavoritosLocales, FAVORITOS, BUSCADOR, videoEmbed, videoThumb, detectRed, formatoRed, paginaPorSlug, postCanvas, baseUrl, jsonLdSitio, jsonLdProducto } from './utils'
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
  const { cfg, productos, banners, enCarrito, agregar, precio } = useStore()
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
  // Limpia todos los filtros en UNA sola actualización (si no, cada set parte del estado original)
  const limpiarFiltros = () => setSp(prev => { const n = new URLSearchParams(prev); ['cat', 'q', 'orden', 'fruto'].forEach(k => n.delete(k)); return n }, { replace: true })
  // SEO del sitio: si no se configura, se usa el nombre de la tienda + slogan
  useEffect(() => {
    registrarVisita(null)
    const marca = cfg.nombre_tienda || 'Mumi Amazonia'
    const path = typeof window !== 'undefined' && window.location.pathname.startsWith('/tienda') ? '/tienda' : '/'
    const sp = (cfg.seo_paginas || {}).tienda || {}
    setSEO({
      title: sp.titulo || cfg.seo_titulo || '',
      desc: sp.desc || cfg.seo_descripcion || [marca, cfg.slogan || cfg.subtitulo].filter(Boolean).join(' — '),
      image: cfg.seo_imagen || cfg.logo_url,
      url: `${baseUrl(cfg)}${path}`,
      siteName: marca,
      keywords: cfg.seo_keywords || '',
      verification: cfg.seo_verificacion || '',
      noindex: cfg.seo_indexar === false || !!cfg.mantenimiento_activo,
      jsonLd: jsonLdSitio(cfg),
    })
  }, [cfg.seo_titulo, cfg.seo_descripcion, cfg.seo_imagen, cfg.seo_keywords, cfg.seo_verificacion, cfg.seo_indexar, cfg.seo_paginas, cfg.nombre_tienda, cfg.slogan, cfg.subtitulo, cfg.url_publica, cfg.mantenimiento_activo])

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
    if (orden === 'precio_asc') r = [...r].sort((a, b) => precio(a) - precio(b))
    else if (orden === 'precio_desc') r = [...r].sort((a, b) => precio(b) - precio(a))
    else if (orden === 'nombre') r = [...r].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    else r = [...r].sort((a, b) => // relevancia: destacados → novedades → con stock → alfabético
      (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0) ||
      (b.novedad ? 1 : 0) - (a.novedad ? 1 : 0) ||
      enStock(b) - enStock(a) ||
      a.nombre.localeCompare(b.nombre, 'es'))
    return r
  }, [productos, cat, fFruto, q, orden, precio])

  if (productos === null) return <div className="spin" />

  const atelier = (cfg.diseno || 'selva') === 'atelier'
  const cardProps = (p) => ({ p, cfg, n: enCarrito(p.id), onOpen: (prod) => abrir(prod || p), onAdd: () => agregar(p, 1) })
  // Una tarjeta por grupo de presentaciones (packs); el resto se elige con chips
  const sinDupPacks = (lista) => {
    const seen = new Set()
    return (lista || []).filter(p => {
      const g = (p.grupo || '').trim()
      if (!g || !p.presentaciones?.length) return true
      if (seen.has(g)) return false
      seen.add(g)
      return true
    })
  }
  // Clásico: scroll (fila) o cuadrícula; Atelier siempre grid
  const vistaProductos = (cfg.productos_vista || 'scroll') === 'grid' ? 'grid' : 'row'
  const listaCls = atelier ? 'grid' : vistaProductos
  const frutosLista = getFrutos()
  // Ambos diseños respetan el switch de Personalizar
  const mostrarFiltroFrutos = !!cfg.mostrar_filtro_frutos && frutosLista.length > 0
  const cosecha = sinDupPacks(destacados.length ? destacados : (productos || []).slice(0, 6))
  const resultadosUnicos = sinDupPacks(resultados)
  const novedadesUnicas = sinDupPacks(novedades)

  const secHead = (eyebrow, titulo, linkTo, linkTxt) => (
    <div className={`sec-head ${atelier ? 'sec-head-atelier' : ''}`}>
      <div>
        {atelier && eyebrow ? <p className="sec-eyebrow">{eyebrow}</p> : null}
        <h2 className="sec-title serif">{titulo}</h2>
      </div>
      {linkTo ? <Link to={linkTo} className="sec-link">{linkTxt || 'Ver todo'} {atelier ? <ChevronRight size={16} /> : null}</Link> : null}
    </div>
  )

  return (
    <>
      {/* Atelier: hero de marca (Munay). Selva: slider productos/banners */}
      {heroOn && (atelier
        ? <BrandHero cfg={cfg} banner={bannersPrincipales[0] || null} />
        : (heroSlides.length > 0 && <HeroSlider slides={heroSlides} onOpen={abrir} />))}

      {/* En móvil: toolbar (relevancia) arriba, frutos debajo — CSS order */}
      <div className="home-filters">
        {mostrarFiltroFrutos && (
          atelier ? (
            <section className="fruto-filter home-frutos">
              <div className="sec-head sec-head-center">
                <h2 className="sec-title serif">{cfg.frutos_filtro_titulo || 'Explora por ingrediente'}</h2>
              </div>
              <div className="frutos">
                <button type="button" className={`fruto ${!fFruto ? 'on' : ''}`} onClick={() => setFFruto('')}>
                  <div className="fruto-emoji"><Search size={22} /></div>
                  <div className="fruto-name">Todos</div>
                </button>
                {frutosLista.map(f => (
                  <button type="button" key={f.id} className={`fruto ${fFruto === f.id ? 'on' : ''}`} onClick={() => setFFruto(fFruto === f.id ? '' : f.id)}>
                    {f.foto_url
                      ? <div className="fruto-foto"><img src={f.foto_url} alt="" /></div>
                      : <div className="fruto-emoji"><FrutoIcon name={f.icono} size={28} /></div>}
                    <div className="fruto-name">{f.nombre}</div>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <div className="chips home-frutos" style={{ paddingTop: 0 }}>
              <button className={`chip chip-sm ${!fFruto ? 'on' : ''}`} onClick={() => setFFruto('')}>Todos los frutos</button>
              {frutosLista.map(f => <button key={f.id} className={`chip chip-sm ${fFruto === f.id ? 'on' : ''}`} onClick={() => setFFruto(fFruto === f.id ? '' : f.id)}><FrutoIcon name={f.icono} size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />{f.nombre}</button>)}
            </div>
          )
        )}

        {/* Toolbar: en Atelier solo búsqueda compacta (menos ruido tipo Munay) */}
        <div className={`toolbar home-toolbar ${atelier ? 'toolbar-atelier' : ''}`}>
          {BUSCADOR && (buscando
            ? <div className="search"><Search size={17} /><input autoFocus placeholder="Buscar producto…" value={q} onChange={e => setQ(e.target.value)} /><button onClick={() => { setQ(''); setBuscando(false) }} aria-label="Cerrar"><X size={16} /></button></div>
            : <button className="search-toggle" onClick={() => setBuscando(true)} aria-label="Buscar"><Search size={18} /> <span>Buscar</span></button>)}
          {!atelier && (
            <>
              <select className="sortsel" value={cat} onChange={e => setCat(e.target.value)} aria-label="Categoría">
                <option value="todos">Todas las categorías</option>
                {cats.map(c => <option key={c} value={c}>{labelCategoria(c)}</option>)}
              </select>
              <select className="sortsel" value={orden} onChange={e => setOrden(e.target.value)} aria-label="Ordenar">
                <option value="rel">Relevancia</option><option value="precio_asc">Precio: menor a mayor</option>
                <option value="precio_desc">Precio: mayor a menor</option><option value="nombre">Nombre (A-Z)</option>
              </select>
            </>
          )}
          {atelier && buscando && (
            <select className="sortsel" value={orden} onChange={e => setOrden(e.target.value)} aria-label="Ordenar">
              <option value="rel">Relevancia</option><option value="precio_asc">Precio ↑</option>
              <option value="precio_desc">Precio ↓</option><option value="nombre">A-Z</option>
            </select>
          )}
        </div>
      </div>

      {filtrando ? (
        <>
          <Migas items={[{ label: cat !== 'todos' ? labelCategoria(cat) : (q ? `Búsqueda: "${q}"` : (fFruto ? labelFruto(fFruto) : 'Resultados')) }]} />
          <div className="sec-head">
            <h2 className="sec-title serif">{resultadosUnicos.length} resultado{resultadosUnicos.length === 1 ? '' : 's'}</h2>
            <button className="sec-link" onClick={() => { limpiarFiltros(); setBuscando(false) }}>Limpiar filtros ✕</button>
          </div>
          <div className="grid">
            {resultadosUnicos.length ? resultadosUnicos.map(p => <Card key={p.id} {...cardProps(p)} />)
              : <p className="empty" style={{ gridColumn: '1 / -1' }}>No encontramos productos. Prueba con otra búsqueda o filtro.</p>}
          </div>
        </>
      ) : (
        <>
          {/* Atelier: cosecha destacada primero (como “Los más vendidos” en Munay) */}
          {atelier && cosecha.length > 0 && (
            <section className="sec-cosecha">
              {secHead(cfg.cosecha_eyebrow || 'Productos destacados', cfg.cosecha_titulo || 'Nuestra cosecha', '/tienda?orden=rel', 'Ver todo')}
              <div className="grid">{cosecha.map(p => <Card key={p.id} {...cardProps(p)} />)}</div>
            </section>
          )}

          {(cfg.secciones || []).filter(s => s.on !== false).map((s, idx) => {
            const key = s.key || s.id || idx
            const tipo = s.tipo || s.id
            const filaCat = (c) => {
              const lista = sinDupPacks(porCategoria[c] || [])
              return lista.length ? (
                <section key={c}>
                  {secHead(null, labelCategoria(c), atelier ? `/tienda?cat=${encodeURIComponent(c)}` : null, 'Ver todo')}
                  <div className={listaCls}>{lista.map(p => <Card key={p.id} {...cardProps(p)} />)}</div>
                </section>
              ) : null
            }
            switch (tipo) {
              case 'hero': return null
              case 'banner': {
                if (s.bannerId) {
                  const b = (banners || []).find(x => String(x.id) === String(s.bannerId) && x.activo !== false)
                  if (!b) return null
                  return atelier ? <BannerGrupo key={key} banners={[b]} /> : <HeroSlider key={key} slides={[b]} onOpen={() => {}} />
                }
                const grupoBanners = (banners || []).filter(b => b.es_secundario && b.activo !== false && ((b.grupo || '').trim() || 'General') === s.grupo)
                if (!grupoBanners.length) return null
                return atelier ? <BannerGrupo key={key} banners={grupoBanners} /> : <HeroSlider key={key} slides={grupoBanners} onOpen={() => {}} />
              }
              case 'novedades':
                if (!novedadesUnicas.length || (atelier && cosecha.length)) return null // en atelier la cosecha ya cubre destacados/novedades arriba
                return (
                  <section key={key}>
                    {secHead(atelier ? 'Lo nuevo' : null, s.titulo || (atelier ? 'Novedades' : '✨ Novedades'), null)}
                    <div className={listaCls}>{novedadesUnicas.map(p => <Card key={p.id} {...cardProps(p)} />)}</div>
                  </section>
                )
              case 'combos': {
                const combos = sinDupPacks((productos || []).filter(p => p._tipo === 'combo'))
                return combos.length > 0 ? (
                  <section key={key}>
                    {secHead(null, s.titulo || (atelier ? 'Kits y combos' : '🎁 Combos'), null)}
                    <div className={listaCls}>{combos.map(p => <Card key={p.id} {...cardProps(p)} />)}</div>
                  </section>
                ) : null
              }
              case 'categorias':
                // En atelier evitamos duplicar si ya hay cosecha; mostramos 1ª categoría con stock
                if (atelier && cosecha.length) {
                  const resto = cats.filter(c => porCategoria[c]?.length).slice(0, 2)
                  return <div key={key}>{resto.map(filaCat)}</div>
                }
                return <div key={key}>{cats.map(filaCat)}</div>
              case 'categoria':
                return <div key={key}>{filaCat(s.categoria)}</div>
              case 'mosaico': case 'frutos':
                // En atelier los círculos ya filtran arriba; el mosaico decorativo se omite para no duplicar
                return atelier ? null : <Mosaico key={key} s={s} />
              case 'impacto':
                return (atelier && cfg.impacto_activo !== false) ? <Impacto key={key} cfg={cfg} /> : null
              case 'newsletter':
                return <Newsletter key={key} />
              default:
                return null
            }
          })}

          {/* Impacto al final si Atelier lo tiene activo y no hay sección impacto en el orden */}
          {atelier && cfg.impacto_activo !== false
            && !(cfg.secciones || []).some(s => (s.tipo || s.id) === 'impacto') && (
            <Impacto cfg={cfg} />
          )}
        </>
      )}

      <div className="footer-space" />
    </>
  )
}

// Iconos sugeridos para chips de beneficio (Atelier)
const ICONO_BENE = [
  [/natural|org[aá]nico|eco/i, Leaf],
  [/az[uú]car|sin az/i, Droplets],
  [/verific|certif|garant/i, BadgeCheck],
]
function iconoBene(texto) {
  for (const [re, Ico] of ICONO_BENE) if (re.test(texto || '')) return Ico
  return Leaf
}

// Mini-card "Combina bien con" (layout Stitch, no Card genérica)
function CardRelAtelier({ p, onOpen, onAdd, precioFn }) {
  const portada = imgsDe(p)[0]
  const src = imgSrc(portada || p.imagen_url, true) || imgSrc(portada || p.imagen_url, false)
  return (
    <article className="rel-mini">
      <button type="button" className="rel-mini-media" onClick={onOpen} aria-label={p.nombre}>
        {src ? <img src={src} alt={altImg(p, portada)} /> : <FrutoIcon name={iconoDe(p.frutos)} size={36} />}
        <span className="rel-mini-add" onClick={(e) => { e.stopPropagation(); onAdd() }} aria-hidden><Plus size={18} /></span>
      </button>
      <button type="button" className="rel-mini-name" onClick={onOpen}>{p.nombre}</button>
      <div className="rel-mini-price">{fCOP(precioFn(p))}</div>
    </article>
  )
}

// ==================== DETALLE DE PRODUCTO ====================
export function Producto() {
  const { id: param } = useParams()
  const nav = useNavigate()
  const { cfg, productos, enCarrito, agregar, esFav, toggleFav, precio, mayorista, enOferta, descuentoPct, establecerEmail } = useStore()
  const p = buscarPorSlug(productos, param)
  const [img, setImg] = useState(0)
  const [drag, setDrag] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const [cant, setCant] = useState(1)
  const [hdrScrolled, setHdrScrolled] = useState(false)
  const [pedirDatos, setPedirDatos] = useState(false)
  const atelier = (cfg.diseno || 'selva') === 'atelier'
  const ctaFijo = atelier && cfg.ficha_cta_fijo !== false

  useEffect(() => {
    setImg(0)
    setCant(1)
    if (!p) {
      setSEO({ title: 'Producto no encontrado', noindex: true, jsonLd: null, siteName: cfg.nombre_tienda || 'Mumi Amazonia' })
      return
    }
    registrarVisita(p.nombre)
    const marca = cfg.nombre_tienda || 'Mumi Amazonia'
    setSEO({
      title: p.seo_titulo || p.nombre,
      desc: p.seo_desc || sinHtml(p.descripcion).slice(0, 160),
      image: p.imagen_url || cfg.seo_imagen || cfg.logo_url,
      url: `${baseUrl(cfg)}${rutaProducto(p)}`,
      type: 'product',
      siteName: marca,
      keywords: cfg.seo_keywords || '',
      verification: cfg.seo_verificacion || '',
      noindex: cfg.seo_indexar === false,
      jsonLd: jsonLdProducto(cfg, p),
    })
  }, [param, p?.nombre, p?.id, cfg.nombre_tienda, cfg.url_publica, cfg.seo_imagen, cfg.logo_url, cfg.seo_keywords, cfg.seo_verificacion, cfg.seo_indexar])

  useEffect(() => {
    if (!atelier) return
    const scroller = document.querySelector('.wrap') || window
    const onScroll = () => {
      const y = scroller === window ? window.scrollY : scroller.scrollTop
      setHdrScrolled(y > 20)
    }
    onScroll()
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', onScroll)
  }, [atelier])

  const galeria = p ? imgsDe(p) : []
  const urlsWeb = galeria.map(g => g.url)
  const pasar = (d) => { if (galeria.length > 1) setImg(k => Math.max(0, Math.min(galeria.length - 1, k + d))) }
  const swipe = useSwipeable({
    onSwiping: (e) => {
      if (galeria.length <= 1) return
      // Dejar pasar scroll vertical; solo arrastrar galería en gestos horizontales
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) return
      const signo = e.dir === 'Left' ? 1 : e.dir === 'Right' ? -1 : 0
      if (!signo) return
      let d = signo * Math.abs(e.deltaX)
      if ((img === 0 && d < 0) || (img === galeria.length - 1 && d > 0)) d /= 3
      setDrag(d)
    },
    onSwipedLeft: () => { if (galeria.length <= 1) return; pasar(1); setDrag(0) },
    onSwipedRight: () => { if (galeria.length <= 1) return; pasar(-1); setDrag(0) },
    onSwiped: () => setDrag(0),
    preventScrollOnSwipe: false,
    trackTouch: galeria.length > 1,
    trackMouse: false,
    delta: 12,
  })

  if (productos === null) return <div className="spin" />
  if (!p) return <div className="empty">Producto no encontrado. <Link to="/tienda" className="sec-link">Volver a la tienda</Link></div>

  const n = enCarrito(p.id)
  const agotado = (p.stock ?? 0) <= 0
  const st = stockLabel(p.stock, cfg)
  const relacionados = (productos || []).filter(x => x.id !== p.id && x.categoria === p.categoria).slice(0, 8)
  const maxCant = Math.max(1, Number(p.stock) || 1)
  const introWA = agotado ? cfg.wa_texto_sin_stock : (mayorista ? (cfg.wa_texto_mayorista || cfg.wa_texto_stock) : cfg.wa_texto_stock)
  const itemsPedido = () => [{ ...p, cantidad: n > 0 ? n : cant }]
  const lanzarPedido = async (nombre, email, telefono) => {
    await confirmarPedidoWA(itemsPedido(), '', cfg, mayorista, introWA, nombre, email, telefono)
  }
  const pedir = () => {
    // Teléfono opcional: basta correo + nombre para lanzar el pedido directo
    if (emailValido(getEmail()) && (getCliente() || '').trim().length >= 2) {
      void lanzarPedido(getCliente(), getEmail(), getTelefono())
    } else {
      setPedirDatos(true)
    }
  }
  const compartirProd = () => compartir({ title: p.nombre, text: `${p.nombre} — ${fCOP(precio(p))}`, url: window.location.href })
  const fav = esFav(p.id)
  const oferta = enOferta(p)
  const envioTxt = (cfg.ficha_mostrar_envio !== false) ? textoEnvio(cfg) : ''
  const titRel = (cfg.ficha_titulo_relacionados || '').trim() || (atelier ? 'Combina bien con' : 'También te puede gustar')
  const catLabel = labelCategoria(p.categoria)
  const modalesPedido = pedirDatos ? (
    <ModalSesionCliente
      titulo="Datos para tu pedido"
      texto="Correo primero: si ya nos escribiste, precargamos tu nombre y teléfono."
      cta="Continuar a WhatsApp"
      onClose={() => setPedirDatos(false)}
      onConfirmar={async ({ email, nombre, telefono }) => {
        establecerEmail?.(email, nombre, telefono)
        setPedirDatos(false)
        await lanzarPedido(nombre, email, telefono)
      }}
    />
  ) : null

  // ——— Layout Stitch / Atelier (móvil + desktop) ———
  if (atelier) {
    return (
      <div className={`prod prod-atelier ${ctaFijo ? 'prod-cta-fijo' : ''}`}>
        {/* App bar móvil (Stitch) */}
        <header className={`ficha-top ${hdrScrolled ? 'ficha-top-solid' : ''}`}>
          <button type="button" className="icon-round" onClick={() => nav(-1)} aria-label="Volver"><ArrowLeft size={18} /></button>
          <div className="serif ficha-top-title">Detalle</div>
          <div className="ficha-top-actions">
            {FAVORITOS && <button type="button" className={`icon-round ${fav ? 'on' : ''}`} onClick={() => toggleFav(p.id)} aria-label="Favorito"><Heart size={18} fill={fav ? 'currentColor' : 'none'} /></button>}
            <button type="button" className="icon-round" onClick={compartirProd} aria-label="Compartir"><Share2 size={18} /></button>
          </div>
        </header>

        {/* Breadcrumbs desktop (Stitch desk) */}
        <nav className="ficha-crumbs" aria-label="Migas de pan">
          <Link to="/tienda">Inicio</Link>
          <ChevronRight size={14} />
          <Link to={`/tienda?cat=${encodeURIComponent(p.categoria || '')}`}>{catLabel}</Link>
          <ChevronRight size={14} />
          <span>{p.nombre}</span>
        </nav>

        <div className="prod-grid atelier-grid">
          <div className="prod-media-col">
            <div className="det-media det-media-atelier" {...(galeria.length > 1 ? swipe : {})} onClick={() => galeria.length && setLightbox(true)}
              style={{ cursor: galeria.length ? 'zoom-in' : 'default' }}>
              <div className="det-ornament det-ornament-a" aria-hidden />
              <div className="det-ornament det-ornament-b" aria-hidden />
              {galeria.length
                ? <div className="det-track" style={{ transform: `translate3d(calc(${-img * 100}% - ${drag}px), 0, 0)`, transition: drag ? 'none' : 'transform .38s cubic-bezier(.22,.61,.36,1)' }}>
                    {galeria.map((g, k) => (
                      <div className="det-slide" key={g.url}>
                        <picture>
                          {g.url_mobile && g.url_mobile !== g.url ? <source media="(max-width: 700px)" srcSet={g.url_mobile} /> : null}
                          <img className="det-float" src={g.url} alt={altImg(p, g)} draggable={false} loading={k === 0 ? 'eager' : 'lazy'} />
                        </picture>
                      </div>
                    ))}
                  </div>
                : <span className="ph-fruto"><FrutoIcon name={iconoDe(p.frutos)} size={72} /></span>}
            </div>
            {galeria.length > 1 && (
              <div className="det-dots" onClick={e => e.stopPropagation()}>
                {galeria.map((_, k) => (
                  <button key={k} type="button" className={`dot ${k === img ? 'on' : ''}`} onClick={() => setImg(k)} aria-label={`Imagen ${k + 1}`} />
                ))}
              </div>
            )}
            {galeria.length > 0 && (
              <div className="det-thumbs atelier-thumbs">
                {galeria.map((g, k) => (
                  <button key={g.url} type="button" className={`det-thumb ${k === img ? 'on' : ''}`} onClick={() => setImg(k)}>
                    <img src={imgSrc(g, true) || g.url} alt={altImg(p, g)} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {lightbox && (
            <Lightbox open close={() => setLightbox(false)} index={img} on={{ view: ({ index }) => setImg(index) }}
              slides={urlsWeb.map(u => ({ src: u }))} plugins={[Zoom, Thumbnails]}
              thumbnails={{ position: 'bottom' }} zoom={{ maxZoomPixelRatio: 3 }} />
          )}

          <div className="det-body">
            <div className="det-head-row">
              <span className="det-cat">{catLabel}</span>
              {oferta && <span className="det-rating" aria-hidden><Star size={16} fill="currentColor" /><span>Oferta</span></span>}
            </div>
            <h1 className="det-name serif">{p.nombre}</h1>
            <div className="det-price">
              <span className="det-price-now">{fCOP(precio(p))}</span>
              {oferta && <><span className="precio-antes">{fCOP(p.precio_detal)}</span><span className="det-off">{descuentoPct(p)}% OFF</span></>}
              {mayorista ? <span className="precio-tag">precio mayorista</span> : (cfg.mostrar_mayor && p.precio_mayor ? <span className="det-mayor">Mayor {fCOP(p.precio_mayor)}</span> : null)}
            </div>
            {st && st.tono !== 'ok' && st.tono !== 'agotado' && <div className={`stock-tag stock-${st.tono}`} style={{ alignSelf: 'flex-start' }}>🔥 {st.texto}</div>}

            {p.beneficios?.length > 0 && (
              <div className="benes benes-atelier">
                {p.beneficios.map((b, i) => {
                  const IcoB = iconoBene(b)
                  return <span key={i} className="bene"><IcoB size={18} />{b}</span>
                })}
              </div>
            )}

            {p.descripcion && (
              <div className="det-desc-block">
                <h3 className="serif det-sec-title">Descripción</h3>
                <div className="det-desc rich-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(p.descripcion) }} />
              </div>
            )}

            {(p.contenido || p.origen || envioTxt) && (
              <div className="det-specs">
                {p.contenido && <div className="det-spec"><span className="det-spec-lbl">Contenido</span><span className="det-spec-val">{p.contenido}</span></div>}
                {p.origen && <div className="det-spec"><span className="det-spec-lbl">Origen</span><span className="det-spec-val">{p.origen}</span></div>}
                {envioTxt && (
                  <div className="det-spec det-spec-envio">
                    <Truck size={32} strokeWidth={1.5} />
                    <div>
                      <span className="det-spec-lbl">Envío Express</span>
                      <span className="det-spec-val">{envioTxt.replace(/^🚚\s*/, '')}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Acciones inline (desktop Stitch) */}
            <div className="ficha-actions-desk">
              {agotado
                ? <div className="agotado-box">Producto agotado por ahora. Escríbenos para avisarte cuando vuelva.</div>
                : (
                  <div className="ficha-actions-row">
                    <div className="qty qty-desk">
                      <button type="button" onClick={() => setCant(c => Math.max(1, c - 1))} disabled={cant <= 1} aria-label="Quitar una unidad"><Minus size={18} /></button>
                      <span aria-live="polite">{cant}</span>
                      <button type="button" onClick={() => setCant(c => Math.min(maxCant, c + 1))} disabled={cant >= maxCant} aria-label="Agregar una unidad"><Plus size={18} /></button>
                    </div>
                    <button type="button" className="btn btn-selva ficha-cta-btn" onClick={() => agregar(p, cant)}>
                      <ShoppingCart size={18} /> Añadir al carrito
                    </button>
                  </div>
                )}
              {FAVORITOS && (
                <button type="button" className={`btn btn-ghost ficha-wish ${fav ? 'on' : ''}`} onClick={() => toggleFav(p.id)}>
                  <Heart size={18} fill={fav ? 'currentColor' : 'none'} /> {fav ? 'En deseos' : 'Añadir a deseos'}
                </button>
              )}
              {agotado && <button type="button" className="btn btn-wa" onClick={pedir}><MessageCircle size={18} /> Consultar por WhatsApp</button>}
            </div>
          </div>
        </div>

        {relacionados.length > 0 && (
          <section className="rel-atelier">
            <div className="rel-atelier-head">
              <div>
                <h2 className="serif">{titRel}</h2>
                <p className="rel-atelier-sub">Potencia tu experiencia con estos complementos amazónicos.</p>
              </div>
              <Link to={`/tienda?cat=${encodeURIComponent(p.categoria || '')}`} className="rel-atelier-all">Ver todos <ChevronRight size={16} /></Link>
            </div>
            <div className="rel-atelier-row">
              {relacionados.map(r => (
                <CardRelAtelier key={r.id} p={r} precioFn={precio}
                  onOpen={() => nav(rutaProducto(r))}
                  onAdd={() => agregar(r, 1)} />
              ))}
            </div>
          </section>
        )}

        {ctaFijo && !agotado && (
          <footer className="ficha-cta">
            <div className="ficha-qty">
              <div className="qty qty-pill">
                <button type="button" onClick={() => setCant(c => Math.max(1, c - 1))} disabled={cant <= 1} aria-label="Quitar una unidad"><Minus size={18} /></button>
                <span aria-live="polite">{cant}</span>
                <button type="button" onClick={() => setCant(c => Math.min(maxCant, c + 1))} disabled={cant >= maxCant} aria-label="Agregar una unidad"><Plus size={18} /></button>
              </div>
            </div>
            <button type="button" className="btn btn-selva ficha-cta-btn" onClick={() => agregar(p, cant)}>
              <ShoppingCart size={18} /> Añadir al carrito
            </button>
          </footer>
        )}
        <div className={`footer-space ${ctaFijo ? 'footer-space-cta' : ''}`} />
        {modalesPedido}
      </div>
    )
  }

  // ——— Layout clásico ———
  const media = (
    <div className="prod-media-col">
      <div className="det-media" {...(galeria.length > 1 ? swipe : {})} onClick={() => galeria.length && setLightbox(true)}
        style={{ cursor: galeria.length ? 'zoom-in' : 'default' }}>
        {galeria.length
          ? <div className="det-track" style={{ transform: `translate3d(calc(${-img * 100}% - ${drag}px), 0, 0)`, transition: drag ? 'none' : 'transform .38s cubic-bezier(.22,.61,.36,1)' }}>
              {galeria.map((g, k) => (
                <div className="det-slide" key={g.url}>
                  <picture>
                    {g.url_mobile && g.url_mobile !== g.url ? <source media="(max-width: 700px)" srcSet={g.url_mobile} /> : null}
                    <img src={g.url} alt={altImg(p, g)} draggable={false} loading={k === 0 ? 'eager' : 'lazy'} />
                  </picture>
                </div>
              ))}
            </div>
          : <span className="ph-fruto"><FrutoIcon name={iconoDe(p.frutos)} size={72} /></span>}
        {galeria.length > 0 && <span className="zoom-hint"><ZoomIn size={16} /> Ampliar</span>}
        {galeria.length > 1 && (
          <div className="det-dots" onClick={e => e.stopPropagation()}>
            {galeria.map((_, k) => (
              <button key={k} type="button" className={`dot ${k === img ? 'on' : ''}`} onClick={() => setImg(k)} aria-label={`Imagen ${k + 1}`} />
            ))}
          </div>
        )}
      </div>
      {galeria.length > 1 && (
        <div className="det-thumbs">{galeria.map((g, k) => (
          <button key={g.url} type="button" className={`det-thumb ${k === img ? 'on' : ''}`} onClick={() => setImg(k)}>
            <img src={imgSrc(g, true) || g.url} alt={altImg(p, g)} />
          </button>
        ))}</div>
      )}
    </div>
  )

  return (
    <div className="prod">
      <Migas items={[{ label: catLabel, to: `/tienda?cat=${encodeURIComponent(p.categoria || '')}` }, { label: p.nombre }]} />
      <div style={{ display: 'flex', alignItems: 'center', padding: '4px 16px' }}>
        <button type="button" className="volver" style={{ padding: 0 }} onClick={() => nav(-1)}><ArrowLeft size={18} /> Volver</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {FAVORITOS && <button type="button" className={`icon-round ${fav ? 'on' : ''}`} onClick={() => toggleFav(p.id)} aria-label="Favorito"><Heart size={18} fill={fav ? 'currentColor' : 'none'} /></button>}
          <button type="button" className="icon-round" onClick={compartirProd} aria-label="Compartir"><Share2 size={18} /></button>
        </div>
      </div>

      <div className="prod-grid">
        {media}
        {lightbox && (
          <Lightbox open close={() => setLightbox(false)} index={img} on={{ view: ({ index }) => setImg(index) }}
            slides={urlsWeb.map(u => ({ src: u }))} plugins={[Zoom, Thumbnails]}
            thumbnails={{ position: 'bottom' }} zoom={{ maxZoomPixelRatio: 3 }} />
        )}

        <div className="det-body">
          <div className="det-head-row"><div className="det-cat">{catLabel}</div></div>
          <h1 className="det-name serif">{p.nombre}</h1>
          <div className="det-price">
            <span className="det-price-now">{fCOP(precio(p))}</span>
            {oferta && <><span className="precio-antes">{fCOP(p.precio_detal)}</span><span className="det-off">-{descuentoPct(p)}% OFF</span></>}
            {mayorista ? <span className="precio-tag">precio mayorista</span> : (cfg.mostrar_mayor && p.precio_mayor ? <span className="det-mayor"> · Mayor {fCOP(p.precio_mayor)}</span> : null)}
          </div>
          {st && st.tono !== 'ok' && st.tono !== 'agotado' && <div className={`stock-tag stock-${st.tono}`} style={{ alignSelf: 'flex-start' }}>🔥 {st.texto}</div>}
          {p.beneficios?.length > 0 && (
            <div className="benes">{p.beneficios.map((b, i) => <span key={i} className="bene">{b}</span>)}</div>
          )}
          {p.descripcion && (
            <div className="det-desc-block">
              <div className="det-desc rich-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(p.descripcion) }} />
            </div>
          )}
          {agotado
            ? <div className="agotado-box">Producto agotado por ahora. Escríbenos para avisarte cuando vuelva.</div>
            : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }}>
                  <span style={{ fontWeight: 600, color: 'var(--texto-suave)' }}>Cantidad</span>
                  <div className="qty">
                    <button type="button" onClick={() => setCant(c => Math.max(1, c - 1))} disabled={cant <= 1} aria-label="Quitar una unidad"><Minus size={18} /></button>
                    <span aria-live="polite">{cant}</span>
                    <button type="button" onClick={() => setCant(c => Math.min(maxCant, c + 1))} disabled={cant >= maxCant} aria-label="Agregar una unidad"><Plus size={18} /></button>
                  </div>
                </div>
                <button type="button" className="btn btn-selva" onClick={() => agregar(p, cant)}>
                  <ShoppingCart size={18} /> Agregar al pedido
                </button>
                {n > 0 && <p style={{ fontSize: '0.85rem', color: 'var(--selva)', fontWeight: 600, marginTop: -4 }}>Ya tienes {n} {n === 1 ? 'unidad' : 'unidades'} en tu pedido.</p>}
              </>
            )}
          <button type="button" className="btn btn-wa" onClick={pedir}><MessageCircle size={18} /> {agotado ? 'Consultar por WhatsApp' : 'Pedir este producto'}</button>
          {p.frutos?.length > 0 && (
            <div className="det-meta">Hecho con {p.frutos.map((f) => (
              <span key={f} className="det-meta-tag"><FrutoIcon name={iconoFruto(f)} size={13} /> {labelFruto(f)}</span>
            ))}</div>
          )}
        </div>
      </div>

      {relacionados.length > 0 && (
        <section>
          <div className="sec-head"><h2 className="sec-title serif">{titRel}</h2></div>
          <div className="row">{relacionados.map(r => <Card key={r.id} p={r} cfg={cfg} n={enCarrito(r.id)} onOpen={(prod) => nav(rutaProducto(prod || r))} onAdd={() => agregar(r, 1)} />)}</div>
        </section>
      )}
      <div className="footer-space" />
      {modalesPedido}
    </div>
  )
}

// ==================== FAVORITOS ====================
export function Favoritos() {
  const { productos, favs, cfg, enCarrito, agregar, emailSesion, establecerEmail } = useStore()
  const nav = useNavigate()
  const [login, setLogin] = useState(false)
  useEffect(() => {
    setSEO({
      title: 'Favoritos',
      url: `${baseUrl(cfg)}/favoritos`,
      siteName: cfg.nombre_tienda || 'Mumi Amazonia',
      noindex: true,
      jsonLd: null,
    })
  }, [cfg.nombre_tienda, cfg.url_publica])
  if (productos === null) return <div className="spin" />
  const logueado = emailValido(emailSesion)
  const lista = (productos || []).filter(p => favs.some(id => String(id) === String(p.id)))
  return (
    <div className="page">
      <Migas items={[{ label: 'Favoritos' }]} />
      <div className="sec-head"><h2 className="sec-title serif">❤️ Tus favoritos</h2></div>
      {!logueado ? (
        <div style={{ padding: '8px 4px 24px', maxWidth: 420 }}>
          <p className="empty" style={{ textAlign: 'left' }}>Ingresa tu correo para ver y sincronizar tus productos favoritos.</p>
          <button type="button" className="btn btn-selva" onClick={() => setLogin(true)}>Ingresar con correo</button>
        </div>
      ) : (
        <>
          <p style={{ fontSize: '0.85rem', color: 'var(--texto-suave)', margin: '0 0 12px' }}>Sesión: {emailSesion}</p>
          {lista.length
            ? <div className="grid">{lista.map(p => <Card key={p.id} p={p} cfg={cfg} n={enCarrito(p.id)} onOpen={(prod) => nav(rutaProducto(prod || p))} onAdd={() => agregar(p, 1)} />)}</div>
            : <p className="empty">Aún no tienes favoritos. Toca el ❤ en un producto para guardarlo.</p>}
        </>
      )}
      {login && (
        <ModalSesionCliente
          titulo="Tu correo"
          texto="Así guardamos tus favoritos y los reconocemos cuando vuelvas."
          cta="Ver mis favoritos"
          pedirTelefono={false}
          onClose={() => setLogin(false)}
          onConfirmar={async ({ email, nombre }) => {
            establecerEmail(email, nombre)
            await sincronizarFavoritosLocales(email, favs, nombre)
            setLogin(false)
          }}
        />
      )}
      <div className="footer-space" />
    </div>
  )
}

// ==================== DESUSCRIBIR ====================
export function Desuscribir() {
  const { cfg } = useStore()
  const [params] = useSearchParams()
  const token = params.get('t') || params.get('token') || ''
  const [estado, setEstado] = useState('idle') // idle | ok | err
  const [msg, setMsg] = useState('')
  useEffect(() => {
    setSEO({ title: 'Cancelar suscripción', noindex: true, siteName: cfg.nombre_tienda || 'Mumi Amazonia', jsonLd: null })
  }, [cfg.nombre_tienda])
  useEffect(() => {
    if (!token) { setEstado('err'); setMsg('Enlace incompleto. Usa el enlace de baja de un correo de Mumi.'); return }
    let cancel = false
    desuscribirPorToken(token).then((ok) => {
      if (cancel) return
      if (ok) { setEstado('ok'); setMsg('Listo. Ya no recibirás correos de Mumi Amazonia.') }
      else { setEstado('ok'); setMsg('Tu correo ya estaba dado de baja, o el enlace no es válido.') }
    }).catch((e) => {
      if (cancel) return
      setEstado('err')
      setMsg(e.message || 'No pudimos procesar la baja. Intenta más tarde.')
    })
    return () => { cancel = true }
  }, [token])
  return (
    <div className="page" style={{ maxWidth: 460, margin: '0 auto', padding: '32px 16px' }}>
      <h1 className="serif" style={{ color: 'var(--selva)', fontSize: '1.5rem' }}>Correos de Mumi</h1>
      {estado === 'idle' && <p style={{ color: 'var(--texto-suave)' }}>Procesando…</p>}
      {estado !== 'idle' && <p style={{ marginTop: 12, color: estado === 'err' ? 'var(--tierra)' : 'var(--selva)' }}>{msg}</p>}
      <Link to="/tienda" className="btn btn-selva" style={{ marginTop: 20, display: 'inline-flex' }}>Volver a la tienda</Link>
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
    const red = b.red || detectRed(b.url)
    const src = videoEmbed(b.url, red)
    if (!src) return null
    const ratio = b.formato || formatoRed(red)
    const vertical = ratio === '9 / 16' || ratio === '4 / 5'
    contenido = <div className="nos-video-wrap">
      {b.titulo && <h3 className="serif nos-subtitulo">{b.titulo}</h3>}
      <div className={`nos-video ${vertical ? 'nos-video-vert' : ''}`} style={{ aspectRatio: ratio }}>
        <iframe src={src} title={b.titulo || 'video'} loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; clipboard-write" allowFullScreen scrolling="no" referrerPolicy="no-referrer-when-downgrade" />
      </div>
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
// La ruta arrastrada vive a nivel de módulo: React recrea objetos en cada render y se perdía.
let DRAG_PATH = null
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
// Bloques que se configuran en un modal del panel (no se pueden editar solo en el lienzo)
const NECESITA_MODAL = ['imagen', 'video', 'boton', 'galeria']
function BloquesEditable({ bloques, onChange, nivel = 0, ruta = [], target }) {
  const [sel, setSel] = useState(null)
  const ctxTop = useContext(DnDCtx)
  // El nivel 0 crea el controlador de arrastre (opera sobre el árbol completo)
  const dnd = ctxTop || {
    mover(desde, hacia) {
      const t = JSON.parse(JSON.stringify(bloques))
      const s = walkParent(t, desde); const [blk] = s.arr.splice(s.idx, 1)
      const d = walkParent(t, hacia); let di = d.idx
      if (s.arr === d.arr && di > s.idx) di--
      d.arr.splice(di, 0, blk); onChange(t)
    },
  }
  const setDrag = (path) => { DRAG_PATH = path }
  const soltarEn = (hacia) => { if (DRAG_PATH && !mismaRuta(DRAG_PATH, hacia)) dnd.mover(DRAG_PATH, hacia); DRAG_PATH = null }
  const upd = (i, nb) => onChange(bloques.map((b, k) => k === i ? nb : b))
  const updC = (i, campo, val) => upd(i, { ...bloques[i], [campo]: val })
  const del = (i) => { onChange(bloques.filter((_, k) => k !== i)); setSel(null) }
  const mov = (i, d) => { const a = [...bloques]; const j = i + d; if (j < 0 || j >= a.length) return;[a[i], a[j]] = [a[j], a[i]]; onChange(a) }
  const pedirModal = (i) => postCanvas({ type: 'mumi-canvas-editar', target, ruta: [...ruta, i] })
  const add = (tipo) => {
    const a = [...bloques]; const nb = nuevoBloqueCat(tipo)
    const at = sel == null ? a.length : sel + 1
    a.splice(at, 0, nb); onChange(a); setSel(at)
    // Los que necesitan datos (imagen, video, botón, galería) abren su modal en el panel
    if (NECESITA_MODAL.includes(tipo)) setTimeout(() => pedirModal(at), 80)
  }
  const anchos = { auto: 'Auto', 3: '1/4', 4: '1/3', 6: '1/2', 8: '2/3', 9: '3/4' }
  const alignActual = (b) => b.align || (b.tipo === 'titulo' ? 'center' : 'left')
  // Los párrafos además admiten "justificado"
  const ordenAlign = (b) => b.tipo === 'parrafo' ? ['left', 'center', 'right', 'justify'] : ['left', 'center', 'right']
  const ciclarAlign = (i, b) => { const o = ordenAlign(b); upd(i, { ...b, align: o[(o.indexOf(alignActual(b)) + 1) % o.length] }) }
  const ICONO_ALIGN = { left: '⯇', center: '≡', right: '⯈', justify: '☰' }
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
            draggable={sel === i}
            onDragStart={(e) => {
              e.stopPropagation()
              try { e.dataTransfer.setData('text/plain', ''); e.dataTransfer.effectAllowed = 'move' } catch { /* noop */ }
              setDrag([...ruta, i]); document.body.classList.add('arrastrando')
            }}
            onDragEnd={() => { DRAG_PATH = null; document.body.classList.remove('arrastrando') }}
            onClick={(e) => { e.stopPropagation(); setSel(i) }}
            onDragOver={(e) => { if (DRAG_PATH) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; e.currentTarget.classList.add('over') } }}
            onDragLeave={(e) => e.currentTarget.classList.remove('over')}
            onDrop={(e) => { if (!DRAG_PATH) return; e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove('over'); soltarEn([...ruta, i]) }}>
            {sel === i && (
              <div className="edit-tool" onClick={e => e.stopPropagation()}>
                <span className="edit-grip" title="Arrastra el bloque para moverlo (a cajas y columnas)">⠿</span>
                <span className="edit-tool-tipo">{b.tipo}</span>
                <button onClick={() => pedirModal(i)} title="Configurar este bloque">✎</button>
                <button onClick={() => ciclarAlign(i, b)} title={`Alinear (${alignActual(b)})`}>{ICONO_ALIGN[alignActual(b)]}</button>
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
                ? <Editable html className="rich-content nos-parrafo" style={{ textAlign: alignActual(b) }} initial={b.html || b.texto} onCommit={(val) => updC(i, 'html', val)} />
                : b.tipo === 'boton'
                  ? <div className="nos-boton-wrap"><Editable tag="span" className="btn btn-selva nos-boton" initial={b.texto} onCommit={(val) => updC(i, 'texto', val)} /></div>
                  : b.tipo === 'caja'
                    ? <div className="blk-caja edit-caja"
                        onDragOver={(e) => { if (DRAG_PATH) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; e.currentTarget.classList.add('caja-over') } }}
                        onDragLeave={(e) => e.currentTarget.classList.remove('caja-over')}
                        onDrop={(e) => { if (!DRAG_PATH) return; e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove('caja-over'); soltarEn([...ruta, i, 'caja', (b.bloques || []).length]) }}>
                        <div className="edit-caja-lbl">Caja — suelta elementos aquí</div>
                        <BloquesEditable bloques={b.bloques || []} onChange={(nb) => updC(i, 'bloques', nb)} nivel={nivel + 1} ruta={[...ruta, i, 'caja']} target={target} />
                      </div>
                    : b.tipo === 'fila'
                      ? <div className="blk-fila">{(b.columnas || []).map((c, ci) => (
                          <div className="blk-col edit-col" key={ci} style={{ flexBasis: c.ancho && c.ancho !== 'auto' ? `${(Number(c.ancho) / 12) * 100}%` : undefined, flexGrow: c.ancho && c.ancho !== 'auto' ? 0 : 1 }}
                            onDragOver={(e) => { if (DRAG_PATH) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; e.currentTarget.classList.add('col-over') } }}
                            onDragLeave={(e) => e.currentTarget.classList.remove('col-over')}
                            onDrop={(e) => { if (!DRAG_PATH) return; e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove('col-over'); soltarEn([...ruta, i, { col: ci }, (c.bloques || []).length]) }}>
                            <div className="edit-col-head" onClick={e => e.stopPropagation()}>
                              <span>Col {ci + 1}</span>
                              <select value={c.ancho || 'auto'} onChange={e => updC(i, 'columnas', b.columnas.map((x, k) => k === ci ? { ...x, ancho: e.target.value } : x))}>
                                {Object.entries(anchos).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                              </select>
                              {b.columnas.length > 1 && <button onClick={() => updC(i, 'columnas', b.columnas.filter((_, k) => k !== ci))} title="Quitar columna">✕</button>}
                            </div>
                            <BloquesEditable bloques={c.bloques || []} onChange={(nb) => updC(i, 'columnas', b.columnas.map((x, k) => k === ci ? { ...x, bloques: nb } : x))} nivel={nivel + 1} ruta={[...ruta, i, { col: ci }]} target={target} />
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
  useEffect(() => {
    const marca = cfg.nombre_tienda || 'Mumi Amazonia'
    const sp = (cfg.seo_paginas || {}).nosotros || {}
    setSEO({
      title: sp.titulo || 'Nosotros',
      desc: sp.desc || sinHtml(cfg.nosotros_texto).slice(0, 160) || 'Productos con origen en la selva del Guaviare.',
      image: cfg.seo_imagen || cfg.logo_url,
      url: `${baseUrl(cfg)}/nosotros`,
      siteName: marca,
      keywords: cfg.seo_keywords || '',
      verification: cfg.seo_verificacion || '',
      noindex: cfg.seo_indexar === false,
      jsonLd: null,
    })
  }, [cfg.nosotros_texto, cfg.nombre_tienda, cfg.url_publica, cfg.seo_imagen, cfg.logo_url, cfg.seo_keywords, cfg.seo_verificacion, cfg.seo_indexar, cfg.seo_paginas])
  const editando = edicion?.on && edicion.target === 'nosotros'
  const bloques = Array.isArray(cfg.nosotros_bloques) && cfg.nosotros_bloques.length
    ? cfg.nosotros_bloques
    : (cfg.nosotros_texto ? [{ tipo: 'parrafo', html: cfg.nosotros_texto }] : [])
  return (
    <div className="page">
      <Migas items={[{ label: 'Nosotros' }]} />
      <div className="nos-cuerpo">{editando ? <BloquesEditable bloques={bloques} target="nosotros" onChange={(nb) => postCanvas({ type: 'mumi-canvas-set', target: 'nosotros', bloques: nb })} /> : <Bloques bloques={bloques} />}</div>
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
  useEffect(() => {
    if (!pag) return
    const marca = cfg.nombre_tienda || 'Mumi Amazonia'
    setSEO({
      title: pag.seo_titulo || pag.titulo,
      desc: sinHtml(pag.seo_desc || pag.subtitulo || '').slice(0, 160) || cfg.seo_descripcion || '',
      image: pag.seo_imagen || cfg.seo_imagen || cfg.logo_url,
      url: `${baseUrl(cfg)}/p/${encodeURIComponent(pag.slug)}`,
      siteName: marca,
      keywords: cfg.seo_keywords || '',
      verification: cfg.seo_verificacion || '',
      noindex: cfg.seo_indexar === false,
      jsonLd: null,
    })
  }, [pag?.titulo, pag?.seo_titulo, pag?.slug, pag?.seo_desc, pag?.seo_imagen, pag?.subtitulo, cfg.nombre_tienda, cfg.url_publica, cfg.seo_imagen, cfg.logo_url, cfg.seo_descripcion, cfg.seo_keywords, cfg.seo_verificacion, cfg.seo_indexar])
  if (cfg.paginas == null) return <div className="spin" />
  if (!pag) return <div className="empty">Página no encontrada. <Link to="/tienda" className="sec-link">Volver a la tienda</Link></div>
  return (
    <div className="page">
      <Migas items={[{ label: pag.titulo }]} />
      {pag.titulo && <div style={{ padding: '8px 16px 0' }}><h1 className="serif" style={{ fontSize: '1.7rem', color: 'var(--selva)' }}>{pag.titulo}</h1></div>}
      <div className="nos-cuerpo">{editando
        ? <BloquesEditable bloques={pag.bloques || []} target={`pagina:${slug}`} onChange={(nb) => postCanvas({ type: 'mumi-canvas-set', target: `pagina:${slug}`, bloques: nb })} />
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
  const [pidiendo, setPidiendo] = useState(false)   // modal que pide el nombre
  useEffect(() => {
    setSEO({
      title: 'Acceso mayorista',
      url: `${baseUrl(cfg)}/mayorista`,
      siteName: cfg.nombre_tienda || 'Mumi Amazonia',
      noindex: true,
      jsonLd: null,
    })
  }, [cfg.nombre_tienda, cfg.url_publica])
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
              <button type="button" className="btn btn-wa" onClick={() => setPidiendo(true)}><MessageCircle size={18} /> Solicitar acceso por WhatsApp</button>
            </form>}
      </div>
      {pidiendo && (
        <ModalNombre inicial={getCliente()} titulo="¿Cómo te llamas?"
          texto="Así sabemos con quién hablamos al darte acceso mayorista."
          onClose={() => setPidiendo(false)}
          onConfirmar={(n) => { setCliente(n); setPidiendo(false); abrirWA(cfg, mensajeSolicitudMayorista(cfg, n)) }} />
      )}
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
  useEffect(() => {
    const marca = cfg.nombre_tienda || 'Mumi Amazonia'
    const sp = (cfg.seo_paginas || {}).galeria || {}
    setSEO({
      title: sp.titulo || cfg.galeria_titulo || 'Galería',
      desc: sp.desc || cfg.galeria_subtitulo || cfg.seo_descripcion || '',
      image: cfg.seo_imagen || cfg.logo_url,
      url: `${baseUrl(cfg)}${typeof window !== 'undefined' ? window.location.pathname : '/galeria'}`,
      siteName: marca,
      keywords: cfg.seo_keywords || '',
      verification: cfg.seo_verificacion || '',
      noindex: cfg.seo_indexar === false,
      jsonLd: null,
    })
  }, [cfg.galeria_titulo, cfg.galeria_subtitulo, cfg.nombre_tienda, cfg.url_publica, cfg.seo_imagen, cfg.logo_url, cfg.seo_descripcion, cfg.seo_keywords, cfg.seo_verificacion, cfg.seo_indexar, cfg.seo_paginas])
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
  useEffect(() => {
    const marca = cfg.nombre_tienda || 'Mumi Amazonia'
    const sp = (cfg.seo_paginas || {}).contacto || {}
    setSEO({
      title: sp.titulo || 'Contacto',
      desc: sp.desc || `Contacta a ${marca}. Pedidos, mayoristas y alianzas por WhatsApp.`,
      image: cfg.seo_imagen || cfg.logo_url,
      url: `${baseUrl(cfg)}/contacto`,
      siteName: marca,
      keywords: cfg.seo_keywords || '',
      verification: cfg.seo_verificacion || '',
      noindex: cfg.seo_indexar === false,
      jsonLd: null,
    })
  }, [cfg.nombre_tienda, cfg.url_publica, cfg.seo_imagen, cfg.logo_url, cfg.seo_keywords, cfg.seo_verificacion, cfg.seo_indexar, cfg.seo_paginas])
  const [f, setF] = useState({ nombre: '', email: '', telefono: '', mensaje: '' })
  const [ok, setOk] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const enviar = async (e) => {
    e.preventDefault(); setErr('')
    if (!f.mensaje.trim()) { setErr('Escribe tu mensaje'); return }
    try {
      await supabase.from('mensajes_catalogo').insert({ nombre: f.nombre || null, email: f.email || null, telefono: f.telefono || null, mensaje: f.mensaje.trim() })
      // Lead a la lista CRM (no bloquea el envío del mensaje si falla)
      if (emailValido(f.email)) { try { await suscribir(f.email, f.nombre, 'contacto', f.telefono) } catch { /* noop */ } }
      setOk(true)
    }
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

/** 404 real (evita soft-404 indexable al redirigir todo a Home) */
export function NoEncontrado() {
  const { cfg } = useStore()
  const nav = useNavigate()
  useEffect(() => {
    const marca = cfg.nombre_tienda || 'Mumi Amazonia'
    setSEO({
      title: 'Página no encontrada',
      desc: 'La página que buscas no existe en el catálogo.',
      url: typeof window !== 'undefined' ? window.location.href.split('?')[0] : '',
      siteName: marca,
      noindex: true,
      jsonLd: null,
    })
  }, [cfg.nombre_tienda])
  return (
    <div className="page" style={{ textAlign: 'center', padding: '48px 20px' }}>
      <div style={{ fontSize: '2.4rem', fontWeight: 800, color: 'var(--selva)', opacity: 0.35 }}>404</div>
      <h1 className="serif" style={{ fontSize: '1.5rem', color: 'var(--selva)', marginTop: 8 }}>Página no encontrada</h1>
      <p style={{ color: 'var(--texto-suave)', margin: '10px auto 18px', maxWidth: '36ch' }}>El enlace no existe o ya no está disponible.</p>
      <button type="button" className="btn btn-selva" style={{ width: 'auto', margin: '0 auto' }} onClick={() => nav('/tienda')}>Ir a la tienda</button>
      <div className="footer-space" />
    </div>
  )
}
