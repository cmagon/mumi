import { Component } from 'react'

// Captura errores de render para evitar la pantalla en blanco y mostrar el detalle.
//
// `resetKey`: cuando cambia (se le pasa la ruta actual), el error se limpia solo. Sin esto,
// un módulo que fallaba dejaba el boundary "pegado": el usuario hacía clic en otra opción del
// menú, la ruta cambiaba, pero se seguía viendo la pantalla de error y parecía que la app
// entera se había caído.
export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('ErrorBoundary:', error, info) }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 620, width: '100%', background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            <h2 style={{ color: '#c0392b', marginTop: 0 }}>Ocurrió un error al mostrar esta página</h2>
            <p style={{ fontSize: '0.9rem', color: '#555' }}>
              El resto de la aplicación sigue funcionando: puedes <strong>elegir otro módulo en el menú</strong> y continuar
              trabajando. Si el problema se repite, recarga.
            </p>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', color: '#555', background: '#f7f7f7', padding: 12, borderRadius: 8, maxHeight: 200, overflow: 'auto' }}>
              {String(this.state.error?.message || this.state.error)}
            </pre>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => location.reload()}>Recargar esta página</button>
              <button className="btn btn-secondary" onClick={() => { location.href = '/' }}>Ir al Tablero</button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
