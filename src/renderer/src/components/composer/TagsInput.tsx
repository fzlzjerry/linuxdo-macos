import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { discourse } from '../../lib/discourse/client'
import { compactNumber } from '../../lib/format'
import styles from './TagsInput.module.css'

interface Suggestion {
  name: string
  count: number
}

interface Props {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  placeholder?: string
  'aria-label': string
  className?: string
}

const SEP = /[,，\s]+/

/** Comma-separated tag input with live suggestions: typing matches existing
    tags (with topic counts); an empty focused field offers the 5 most-used. */
export function TagsInput({
  value,
  onChange,
  disabled,
  placeholder,
  'aria-label': ariaLabel,
  className
}: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Suggestion[]>([])
  const [active, setActive] = useState(0)
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const seq = useRef(0)

  const parts = value.split(SEP)
  const term = (parts[parts.length - 1] ?? '').trim()
  const chosen = parts
    .slice(0, -1)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  function openDropdown(): void {
    const el = inputRef.current
    if (!el || disabled) return
    const r = el.getBoundingClientRect()
    setAnchor({ left: r.left, top: r.bottom + 4, width: r.width })
    setOpen(true)
  }

  // Fetch suggestions: debounce while typing; instant top-5 when empty.
  useEffect(() => {
    if (!open) return
    const id = ++seq.current
    const t = setTimeout(
      () => {
        discourse
          .searchTags(term, term ? 8 : 5)
          .then((list) => {
            if (seq.current !== id) return
            setItems(list.filter((s) => !chosen.includes(s.name.toLowerCase())))
            setActive(0)
          })
          .catch(() => {
            if (seq.current === id) setItems([])
          })
      },
      term ? 200 : 0
    )
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, term, value])

  // Outside click / scroll / resize close (popover is fixed-positioned).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onScroll = (e: Event): void => {
      if (rootRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onResize = (): void => setOpen(false)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  function pick(s: Suggestion): void {
    const keep = parts
      .slice(0, -1)
      .map((p) => p.trim())
      .filter(Boolean)
    onChange([...keep, s.name].join(', ') + ', ')
    inputRef.current?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (!open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        openDropdown()
      }
      return
    }
    if (e.key === 'Escape') {
      // Close only the dropdown — not the enclosing dialog.
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      return
    }
    if (items.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + items.length) % items.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(items[active])
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className={`${styles.wrap} ${className ?? ''}`}>
      <input
        ref={inputRef}
        className={styles.input}
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          onChange(e.target.value)
          if (!open) openDropdown()
        }}
        onFocus={openDropdown}
        onKeyDown={onKeyDown}
      />
      {open && anchor && items.length > 0 && (
        <ul
          className={styles.pop}
          role="listbox"
          aria-label="标签建议"
          style={{ left: anchor.left, top: anchor.top, width: anchor.width }}
        >
          {items.map((s, i) => (
            <li key={s.name}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className={`${styles.item} ${i === active ? styles.itemActive : ''}`}
                onMouseDown={(e) => e.preventDefault() /* keep input focus */}
                onClick={() => pick(s)}
                onMouseEnter={() => setActive(i)}
              >
                <span className={styles.name}>{s.name}</span>
                <span className={styles.count}>{compactNumber(s.count)} 话题</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
