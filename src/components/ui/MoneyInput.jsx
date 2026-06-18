// Campo de dinero: muestra el valor con separador de miles y símbolo $ mientras se escribe.
// Internamente entrega/recibe un número (o '' si está vacío).
export default function MoneyInput({ value, onChange, placeholder = '$ 0', disabled, className = 'form-control', style }) {
  const num = (value === '' || value === null || value === undefined) ? '' : Number(value)
  const display = num === '' || isNaN(num) ? '' : '$ ' + num.toLocaleString('es-CO')

  const handle = (e) => {
    const digits = e.target.value.replace(/[^\d]/g, '')
    onChange(digits === '' ? '' : Number(digits))
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      className={className}
      value={display}
      placeholder={placeholder}
      disabled={disabled}
      style={{ textAlign: 'right', ...style }}
      onChange={handle}
    />
  )
}
