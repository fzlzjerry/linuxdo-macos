import { useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import styles from './Segmented.module.css'

interface Option<T extends string> {
  value: T
  label: ReactNode
  disabled?: boolean
  title?: string
}

interface Props<T extends string> {
  options: Option<T>[]
  value: T
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  /** Accessible name for the group — required, these are icon/word toggles. */
  'aria-label': string
  disabled?: boolean
}

/** Radio-style segmented control: roving tabindex, arrow-key selection. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'sm',
  'aria-label': ariaLabel,
  disabled = false
}: Props<T>): JSX.Element {
  const groupRef = useRef<HTMLDivElement>(null)

  function select(next: Option<T>): void {
    onChange(next.value)
    requestAnimationFrame(() => {
      groupRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
    })
  }

  function onKeyDown(e: KeyboardEvent, index: number): void {
    const enabled = options.filter((o) => !o.disabled)
    if (disabled || enabled.length === 0) return
    let next: Option<T> | undefined
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1
      const pos = enabled.findIndex((o) => o.value === options[index].value)
      next = enabled[(pos + dir + enabled.length) % enabled.length]
    } else if (e.key === 'Home') {
      next = enabled[0]
    } else if (e.key === 'End') {
      next = enabled[enabled.length - 1]
    } else {
      return
    }
    e.preventDefault()
    select(next)
  }

  return (
    <div
      ref={groupRef}
      className={`${styles.group} ${styles[size]}`}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={opt.value === value}
          tabIndex={opt.value === value ? 0 : -1}
          disabled={disabled || opt.disabled}
          title={opt.title}
          className={`${styles.seg} ${opt.value === value ? styles.active : ''}`}
          onClick={() => onChange(opt.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
