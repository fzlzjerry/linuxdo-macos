import { useState } from 'react'
import { avatarUrl } from '../../lib/discourse/urls'
import styles from './Avatar.module.css'

const HUES = [8, 32, 70, 145, 190, 233, 270, 320]

function hueFor(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return HUES[h % HUES.length]
}

interface AvatarProps {
  template?: string
  username?: string
  name?: string
  size?: number
  className?: string
}

export function Avatar({ template, username, name, size = 40, className }: AvatarProps): JSX.Element {
  const [failed, setFailed] = useState(false)
  const url = avatarUrl(template, size)
  const label = (name || username || '?').trim()
  const initial = label ? Array.from(label)[0].toUpperCase() : '?'
  const style = { width: size, height: size } as const

  if (!url || failed) {
    const hue = hueFor(username || label)
    return (
      <span
        className={`${styles.avatar} ${styles.fallback} ${className ?? ''}`}
        style={{
          ...style,
          background: `oklch(0.7 0.12 ${hue})`,
          fontSize: Math.round(size * 0.42)
        }}
        aria-hidden
      >
        {initial}
      </span>
    )
  }

  return (
    <img
      className={`${styles.avatar} ${className ?? ''}`}
      style={style}
      src={url}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
