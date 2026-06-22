import { Component } from 'react'

// Captura errores de render para evitar la pantalla en blanco y mostrar el detalle.
export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('ErrorBoundary:', error, info) }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#f5f0e8' }}>
          <div style={{ maxWidth: 560, background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            <h2 style={{ color: '#c0392b' }}>Ocurrió un error al mostrar la página</h2>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', color: '#555', background: '#f7f7f7', padding: 12, borderRadius: 8 }}>{String(this.state.error?.message || this.state.error)}</pre>
            <button className="btn btn-primary" onClick={() => location.reload()}>Recargar</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
