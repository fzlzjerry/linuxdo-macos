import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import styles from './Toolbar.module.css'

interface ToolbarProps {
  title: ReactNode
  subtitle?: ReactNode
  left?: ReactNode
  right?: ReactNode
}

export function Toolbar({ title, subtitle, left, right }: ToolbarProps): JSX.Element {
  useEffect(() => {
    if (typeof title !== 'string' || !title) return
    const full = `${title} — LinuxDO`
    document.title = full
    try {
      void getCurrentWindow().setTitle(full)
    } catch {
      /* not running under Tauri */
    }
  }, [title])

  return (
    <header className={styles.toolbar}>
      {/* WKWebView has no -webkit-app-region; Tauri only starts a drag when the
          mousedown target itself carries data-tauri-drag-region, so an overlay
          layer covers the bar and controls sit above it. */}
      <div className={styles.dragLayer} data-tauri-drag-region aria-hidden />
      {left && <div className={styles.left}>{left}</div>}
      <div className={styles.titleWrap}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </div>
      {right && <div className={styles.right}>{right}</div>}
    </header>
  )
}
