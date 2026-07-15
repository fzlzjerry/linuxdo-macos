import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
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
  // 0: retina (2x) size, 1: retry at 1x (some sizes can transiently fail), 2: letter tile.
  const [attempt, setAttempt] = useState(0)
  useEffect(() => setAttempt(0), [template])

  const url =
    attempt === 0
      ? avatarUrl(template, size)
      : attempt === 1
        ? avatarUrl(template, Math.max(1, Math.round(size / 2)))
        : null
  const label = (name || username || '?').trim()
  const initial = label ? Array.from(label)[0].toUpperCase() : '?'
  const style = { width: size, height: size } as const

  if (!url) {
    const hue = hueFor(username || label)
    return (
      <span
        className={`${styles.avatar} ${styles.fallback} ${className ?? ''}`}
        style={
          {
            ...style,
            fontSize: Math.round(size * 0.42),
            '--avatar-h': String(hue)
          } as CSSProperties
        }
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
      onError={() => setAttempt((a) => a + 1)}
    />
  )
}
