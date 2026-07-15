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
    const full = `${title} — Oh My LinuxDo`
    document.title = full
    try {
      void getCurrentWindow().setTitle(full)
    } catch {
      /* not running under Tauri */
    }
  }, [title])

  return (
    // "deep": any non-interactive spot in the bar drags the window; buttons
    // and other clickables are exempted by Tauri's drag script automatically.
    <header className={styles.toolbar} data-tauri-drag-region="deep">
      {left && <div className={styles.left}>{left}</div>}
      <div className={styles.titleWrap}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </div>
      {right && <div className={styles.right}>{right}</div>}
    </header>
  )
}
