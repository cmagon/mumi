import { createContext, useContext, useState, useCallback, useRef } from 'react'
import Modal from '../components/ui/Modal'

const ConfirmCtx = createContext(null)

// Diálogos propios del proyecto (reemplazan window.confirm y window.prompt).
//   const confirmar = useConfirm(); if (await confirmar('¿Seguro?')) {...}
//   const pedir = usePrompt(); const txt = await pedir('Nombre:', { defaultValue:'x' })
export function ConfirmProvider({ children }) {
  const [state, setState] = useState({
    open: false, modo: 'confirm', message: '', title: 'Confirmar',
    confirmText: 'Aceptar', cancelText: 'Cancelar', danger: true, valor: '',
  })
  const resolver = useRef(null)

  const confirmar = useCallback((message, opts = {}) => new Promise((resolve) => {
    resolver.current = resolve
    setState({
      open: true, modo: 'confirm', message,
      title: opts.title || 'Confirmar',
      confirmText: opts.confirmText || 'Aceptar',
      cancelText: opts.cancelText || 'Cancelar',
      danger: opts.danger ?? true, valor: '',
    })
  }), [])

  const pedir = useCallback((message, opts = {}) => new Promise((resolve) => {
    resolver.current = resolve
    setState({
      open: true, modo: 'prompt', message,
      title: opts.title || 'Ingresar dato',
      confirmText: opts.confirmText || 'Aceptar',
      cancelText: opts.cancelText || 'Cancelar',
      danger: false, valor: opts.defaultValue || '',
    })
  }), [])

  const cerrar = (val) => {
    setState(s => ({ ...s, open: false }))
    const r = resolver.current; resolver.current = null
    if (r) r(val)
  }

  return (
    <ConfirmCtx.Provider value={{ confirmar, pedir }}>
      {children}
      <Modal open={state.open} onClose={() => cerrar(state.modo === 'prompt' ? null : false)} guard={false} title={state.title}
        footer={<>
          <button className="btn btn-secondary" onClick={() => cerrar(state.modo === 'prompt' ? null : false)}>{state.cancelText}</button>
          <button className={`btn ${state.danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => cerrar(state.modo === 'prompt' ? state.valor : true)}>{state.confirmText}</button>
        </>}
      >
        <p style={{ whiteSpace: 'pre-line', margin: '0 0 ' + (state.modo === 'prompt' ? '12px' : '0'), fontSize: '0.92rem', color: 'var(--texto)' }}>{state.message}</p>
        {state.modo === 'prompt' && (
          <input className="form-control" autoFocus value={state.valor}
            onChange={e => setState(s => ({ ...s, valor: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') cerrar(state.valor) }} />
        )}
      </Modal>
    </ConfirmCtx.Provider>
  )
}

export const useConfirm = () => {
  const ctx = useContext(ConfirmCtx)
  if (!ctx) throw new Error('useConfirm debe usarse dentro de ConfirmProvider')
  return ctx.confirmar
}
export const usePrompt = () => {
  const ctx = useContext(ConfirmCtx)
  if (!ctx) throw new Error('usePrompt debe usarse dentro de ConfirmProvider')
  return ctx.pedir
}
