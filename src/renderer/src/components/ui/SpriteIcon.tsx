import type { CSSProperties } from 'react'
import { useSpriteReady } from '../../lib/svgSprite'

/** Renders a linux.do sprite icon (Font Awesome name) via <use>. Returns null
    until the sprite is injected — callers should render their own fallback. */
export function SpriteIcon({
  name,
  size = 14,
  color,
  className
}: {
  name?: string | null
  size?: number
  color?: string
  className?: string
}): JSX.Element | null {
  const ready = useSpriteReady()
  if (!ready || !name) return null
  const style: CSSProperties = { fill: 'currentColor', flex: 'none' }
  if (color) style.color = color
  return (
    <svg width={size} height={size} style={style} className={className} aria-hidden>
      <use href={`#${name}`} />
    </svg>
  )
}
