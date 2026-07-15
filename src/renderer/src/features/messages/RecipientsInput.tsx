import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Avatar } from '../../components/ui/Avatar'
import { discourse } from '../../lib/discourse/client'
import styles from './RecipientsInput.module.css'

interface Suggestion {
  username: string
  name?: string
  avatar_template?: string
}

interface Props {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  autoFocus?: boolean
  placeholder?: string
  // Injected by <Field> via cloneElement; forwarded to the inner <input>.
  id?: string
  className?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  'aria-required'?: boolean
}

/** Comma-separated username field with live @user autocomplete on the token
 *  currently being typed (after the last comma). */
export function RecipientsInput({
  value,
  onChange,
  disabled,
  autoFocus,
  placeholder,
  id,
  className,
  ...aria
}: Props): JSX.Element {
  const [items, setItems] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const seq = useRef(0)
  const wrapRef = useRef<HTMLDivElement>(null)

  const currentToken = value.split(',').pop()?.trim() ?? ''

  useEffect(() => {
    if (!open) return
    const term = currentToken
    if (term.length < 1) {
      setItems([])
      return
    }
    const id = ++seq.current
    const t = setTimeout(() => {
      discourse
        .searchUsers(term)
        .then((r) => {
          if (seq.current !== id) return
          const picked = new Set(
            value
              .split(',')
              .slice(0, -1)
              .map((s) => s.trim().toLowerCase())
          )
          setItems((r.users ?? []).filter((u) => !picked.has(u.username.toLowerCase())))
          setActive(0)
        })
        .catch(() => {
          if (seq.current === id) setItems([])
        })
    }, 180)
    return () => clearTimeout(t)
  }, [currentToken, open, value])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function pick(u: Suggestion): void {
    const parts = value.split(',')
    parts[parts.length - 1] = ` ${u.username}`
    onChange(parts.join(',').replace(/^\s+/, '') + ', ')
    setItems([])
    setOpen(true)
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (!open || items.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a - 1 + items.length) % items.length)
    } else if (e.key === 'Enter' && items[active]) {
      e.preventDefault()
      pick(items[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const showList = open && items.length > 0

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <input
        {...aria}
        id={id}
        className={className}
        type="text"
        value={value}
        placeholder={placeholder ?? '用户名，用逗号分隔'}
        autoFocus={autoFocus}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        aria-label="收件人"
      />
      {showList && (
        <ul className={styles.list} role="listbox">
          {items.map((u, i) => (
            <li key={u.username}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className={`${styles.item} ${i === active ? styles.itemActive : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(u)}
              >
                <Avatar template={u.avatar_template} username={u.username} name={u.name} size={26} />
                <span className={styles.meta}>
                  <span className={styles.username}>{u.username}</span>
                  {u.name && <span className={styles.name}>{u.name}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
