import { ChevronLeft, ChevronRight } from 'lucide-react'
import Select from './Select'
import { ventanaPaginas } from '../../hooks/usePaginacion'

/**
 * Barra de paginación: "Mostrando X–Y de N", selector 10/20/30 y pestañas numeradas.
 */
export default function PaginacionTabla({
  pagina, setPagina, tam, setTam, total, totalPaginas, desde, hasta, tamanos = [10, 20, 30],
}) {
  if (!total) return null

  const tabs = ventanaPaginas(pagina, totalPaginas)

  return (
    <div className="paginacion-tabla">
      <span className="paginacion-resumen">
        Mostrando <strong>{desde}–{hasta}</strong> de <strong>{total}</strong> resultados
      </span>

      <label className="paginacion-tam">
        <span>Por página</span>
        <Select className="form-control" value={String(tam)} onChange={e => setTam(Number(e.target.value))} style={{ width: 'auto', minWidth: 64 }}>
          {tamanos.map(n => <option key={n} value={n}>{n}</option>)}
        </Select>
      </label>

      {totalPaginas > 1 && (
        <nav className="paginacion-tabs" aria-label="Páginas">
          <button type="button" className="paginacion-tab paginacion-flecha" disabled={pagina <= 1}
            onClick={() => setPagina(p => p - 1)} aria-label="Página anterior">
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          {tabs.map((p, i) => p === '…'
            ? <span key={`e${i}`} className="paginacion-elipsis" aria-hidden="true">…</span>
            : (
              <button key={p} type="button"
                className={`paginacion-tab${p === pagina ? ' active' : ''}`}
                aria-current={p === pagina ? 'page' : undefined}
                onClick={() => setPagina(p)}>
                {p}
              </button>
            ))}
          <button type="button" className="paginacion-tab paginacion-flecha" disabled={pagina >= totalPaginas}
            onClick={() => setPagina(p => p + 1)} aria-label="Página siguiente">
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  )
}
