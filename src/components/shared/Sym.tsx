import type { CSSProperties } from 'react'

interface SymProps {
  /** Material Symbols ligature name, e.g. "dashboard", "groups", "edit" */
  name: string
  /** Optical size + font-size in px (default 20) */
  size?: number
  /** Filled variant */
  fill?: boolean
  /** Weight 100–700 (default 400) */
  weight?: number
  className?: string
  style?: CSSProperties
  title?: string
}

/**
 * Material Symbols (Outlined) icon — drop-in replacement for lucide icons.
 * Usage: <Sym name="edit" size={16} className="text-white/70" />
 */
export function Sym({ name, size = 20, fill = false, weight = 400, className = '', style, title }: SymProps) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{
        fontSize: `${size}px`,
        fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${size}`,
        ...style,
      }}
      aria-hidden={title ? undefined : true}
      title={title}
      role={title ? 'img' : undefined}
    >
      {name}
    </span>
  )
}
