// Wrapper de iconos Material Design Icons (MDI) para usar en todo el sistema.
// Uso: import { mdiCheck } from '@mdi/js'; <Mdi path={mdiCheck} size={18} />
// El color se hereda del texto (currentColor), igual que los iconos de lucide.
import Icon from '@mdi/react'

export default function Mdi({ path, size = 18, color, title, style, ...rest }) {
  return (
    <Icon
      path={path}
      title={title}
      style={{ width: size, height: size, verticalAlign: '-0.15em', ...(color ? { color } : {}), ...style }}
      {...rest}
    />
  )
}
