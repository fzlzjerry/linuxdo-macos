import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject
} from 'react'
import { discourse } from '../../lib/discourse/client'
import { EMOJI_SHORTCODES } from '../../lib/emoji'
import { Avatar } from '../ui/Avatar'
import styles from './InlineAutocomplete.module.css'

interface UserItem {
  username: string
  name?: string
  avatar_template?: string
}

interface Token {
  kind: 'user' | 'emoji'
  term: string
  start: number
  end: number
  left: number
  top: number
}

export interface InlineAutocompleteHandle {
  /** Called first by the host textarea's onKeyDown. Returns true when consumed. */
  onKeyDown: (e: ReactKeyboardEvent<HTMLTextAreaElement>) => boolean
}

interface Props {
  textareaRef: RefObject<HTMLTextAreaElement>
  /** The controlled textarea value — drives token re-detection after typing. */
  value: string
  /** Replace [start, end) in the textarea with `insert` (host owns the text state). */
  onReplace: (start: number, end: number, insert: string) => void
}

const CARET_MOVE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End'])
const MENU_WIDTH = 264

// Style properties mirrored onto the measuring div so wrapping matches the textarea.
const MIRROR_PROPS = [
  'boxSizing',
  'width',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontFamily',
  'lineHeight',
  'textAlign',
  'textTransform',
  'textIndent',
  'letterSpacing',
  'wordSpacing',
  'tabSize'
] as const

/** Viewport coordinates of the caret, plus the line height, via a hidden mirror div. */
function caretViewportRect(
  el: HTMLTextAreaElement,
  position: number
): { left: number; top: number; height: number } {
  const computed = window.getComputedStyle(el)
  const div = document.createElement('div')
  const style = div.style as unknown as Record<string, string>
  const src = computed as unknown as Record<string, string>
  style.position = 'absolute'
  style.visibility = 'hidden'
  style.whiteSpace = 'pre-wrap'
  style.wordWrap = 'break-word'
  style.overflow = 'hidden'
  for (const prop of MIRROR_PROPS) style[prop] = src[prop]

  div.textContent = el.value.slice(0, position)
  const marker = document.createElement('span')
  marker.textContent = el.value.slice(position) || '.'
  div.appendChild(marker)
  document.body.appendChild(div)

  // `lineHeight` can compute to "normal" (NaN) in some engines — fall back to font-size.
  const lineHeight =
    parseInt(computed.lineHeight, 10) || Math.round(parseFloat(computed.fontSize) * 1.4)
  // `offsetTop/Left` are measured from the mirror's inner (padding) edge, so add the
  // border widths to map back onto the textarea's border box.
  const borderLeft = parseInt(computed.borderLeftWidth, 10) || 0
  const borderTop = parseInt(computed.borderTopWidth, 10) || 0
  const rect = el.getBoundingClientRect()
  const left = rect.left + borderLeft + marker.offsetLeft - el.scrollLeft
  const top = rect.top + borderTop + marker.offsetTop - el.scrollTop
  document.body.removeChild(div)
  return { left, top, height: lineHeight }
}

/** Detect an `@mention` or `:shortcode` token ending at the caret. */
function tokenAt(value: string, caret: number): { kind: 'user' | 'emoji'; term: string; start: number } | null {
  let i = caret - 1
  while (i >= 0 && /\w/.test(value[i])) i--
  const trigger = value[i]
  if (trigger !== '@' && trigger !== ':') return null
  const before = i > 0 ? value[i - 1] : ''
  if (i > 0 && !/\s/.test(before)) return null // must start a word (avoid a@b, 12:34)
  const term = value.slice(i + 1, caret)
  if (trigger === '@') return { kind: 'user', term, start: i }
  if (term.length >= 2) return { kind: 'emoji', term, start: i }
  return null
}

export const InlineAutocomplete = forwardRef<InlineAutocompleteHandle, Props>(
  function InlineAutocomplete({ textareaRef, value, onReplace }, ref): JSX.Element | null {
    const [token, setToken] = useState<Token | null>(null)
    const [users, setUsers] = useState<UserItem[]>([])
    const [active, setActive] = useState(0)
    const skipNext = useRef(false)
    const menuRef = useRef<HTMLDivElement>(null)

    const compute = useCallback((): void => {
      const el = textareaRef.current
      if (!el || document.activeElement !== el) {
        setToken(null)
        return
      }
      const caret = el.selectionStart
      if (caret !== el.selectionEnd) {
        setToken(null)
        return
      }
      const tk = tokenAt(el.value, caret)
      if (!tk) {
        setToken(null)
        return
      }
      const c = caretViewportRect(el, caret)
      const left = Math.max(8, Math.min(c.left, window.innerWidth - MENU_WIDTH - 8))
      setToken({ ...tk, end: caret, left, top: c.top + c.height + 4 })
    }, [textareaRef])

    // Re-detect on text changes, except right after a programmatic replacement.
    useEffect(() => {
      if (skipNext.current) {
        skipNext.current = false
        return
      }
      compute()
    }, [value, compute])

    // Caret-only moves (arrows / clicks) and blur — driven off the textarea itself.
    useEffect(() => {
      const el = textareaRef.current
      if (!el) return
      const onKeyUp = (e: KeyboardEvent): void => {
        if (CARET_MOVE_KEYS.has(e.key)) compute()
      }
      const onClick = (): void => compute()
      const onBlur = (): void => setToken(null)
      el.addEventListener('keyup', onKeyUp)
      el.addEventListener('click', onClick)
      el.addEventListener('blur', onBlur)
      return () => {
        el.removeEventListener('keyup', onKeyUp)
        el.removeEventListener('click', onClick)
        el.removeEventListener('blur', onBlur)
      }
    }, [textareaRef, compute])

    // Detach the floating menu when either the modal body or the window scrolls —
    // but ignore scrolls inside the menu itself (capture phase also sees those).
    useEffect(() => {
      if (!token) return
      const onScroll = (e: Event): void => {
        if (menuRef.current?.contains(e.target as Node)) return
        setToken(null)
      }
      const onResize = (): void => setToken(null)
      window.addEventListener('scroll', onScroll, true)
      window.addEventListener('resize', onResize)
      return () => {
        window.removeEventListener('scroll', onScroll, true)
        window.removeEventListener('resize', onResize)
      }
    }, [token])

    const userTerm = token?.kind === 'user' ? token.term : null
    useEffect(() => {
      if (userTerm === null) return
      let cancelled = false
      const t = window.setTimeout(() => {
        discourse
          .searchUsers(userTerm)
          .then((r) => {
            if (!cancelled) setUsers(r.users ?? [])
          })
          .catch(() => {
            if (!cancelled) setUsers([])
          })
      }, 200)
      return () => {
        cancelled = true
        window.clearTimeout(t)
      }
    }, [userTerm])

    const emojiItems = useMemo(() => {
      if (token?.kind !== 'emoji') return []
      const q = token.term.toLowerCase()
      return EMOJI_SHORTCODES.filter((e) => e.code.includes(q)).slice(0, 8)
    }, [token])

    const count = token?.kind === 'user' ? users.length : emojiItems.length

    useEffect(() => {
      setActive(0)
    }, [token?.kind, token?.start, token?.term])

    const select = useCallback(
      (i: number): void => {
        if (!token) return
        let insert: string
        if (token.kind === 'user') {
          const u = users[i]
          if (!u) return
          insert = `@${u.username} `
        } else {
          const em = emojiItems[i]
          if (!em) return
          insert = em.char
        }
        skipNext.current = true
        onReplace(token.start, token.end, insert)
        setToken(null)
      },
      [token, users, emojiItems, onReplace]
    )

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown(e): boolean {
          if (!token) return false
          if (e.key === 'Escape') {
            e.preventDefault()
            setToken(null)
            return true
          }
          if (count === 0) return false
          switch (e.key) {
            case 'ArrowDown':
              e.preventDefault()
              setActive((a) => (a + 1) % count)
              return true
            case 'ArrowUp':
              e.preventDefault()
              setActive((a) => (a - 1 + count) % count)
              return true
            case 'Enter':
            case 'Tab':
              e.preventDefault()
              select(active)
              return true
            default:
              return false
          }
        }
      }),
      [token, count, active, select]
    )

    if (!token) return null
    if (token.kind === 'emoji' && count === 0) return null

    return (
      <div
        ref={menuRef}
        className={styles.menu}
        style={{ left: token.left, top: token.top }}
        role="listbox"
      >
        {token.kind === 'user' ? (
          users.length === 0 ? (
            <div className={styles.hint}>无匹配用户</div>
          ) : (
            users.map((u, i) => (
              <button
                key={u.username}
                type="button"
                role="option"
                aria-selected={i === active}
                className={i === active ? styles.itemActive : styles.item}
                onMouseDown={(e) => {
                  e.preventDefault()
                  select(i)
                }}
                onMouseEnter={() => setActive(i)}
              >
                <Avatar
                  template={u.avatar_template}
                  username={u.username}
                  name={u.name}
                  size={22}
                />
                <span className={styles.name}>{u.name || u.username}</span>
                <span className={styles.sub}>@{u.username}</span>
              </button>
            ))
          )
        ) : (
          emojiItems.map((em, i) => (
            <button
              key={em.code}
              type="button"
              role="option"
              aria-selected={i === active}
              className={i === active ? styles.itemActive : styles.item}
              onMouseDown={(e) => {
                e.preventDefault()
                select(i)
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className={styles.emoji}>{em.char}</span>
              <span className={styles.code}>:{em.code}:</span>
            </button>
          ))
        )}
      </div>
    )
  }
)
