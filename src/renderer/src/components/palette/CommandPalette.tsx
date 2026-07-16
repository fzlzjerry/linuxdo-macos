import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeft,
  ArrowRight,
  Download,
  History,
  Monitor,
  Moon,
  PanelLeft,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  SquarePen,
  Sun,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import { NAV_SECTIONS } from '../../lib/nav'
import {
  PALETTE_COMMANDS,
  runCommand,
  type AppCommand,
  type CommandCtx
} from '../../lib/commands'
import { fuzzyScore } from '../../lib/fuzzy'
import { usePalette } from '../../store/palette'
import { useRecents } from '../../store/recents'
import styles from './CommandPalette.module.css'

/** Command id → icon for「导航」items, mirroring commands.ts's id scheme. */
const NAV_ICONS = new Map<string, LucideIcon>(
  NAV_SECTIONS.flatMap((s) => s.items).map((i) => [`nav${i.to.replace(/\//g, '.')}`, i.icon])
)

const ACTION_ICONS: Record<string, LucideIcon> = {
  'file.new-topic': SquarePen,
  'view.reload': RefreshCw,
  'app.settings': Settings,
  'view.toggle-sidebar': PanelLeft,
  'view.font-up': ZoomIn,
  'view.font-down': ZoomOut,
  'view.font-reset': RotateCcw,
  'theme.light': Sun,
  'theme.dark': Moon,
  'theme.system': Monitor,
  'app.check-updates': Download,
  'go.back': ArrowLeft,
  'go.forward': ArrowRight
}

interface Item {
  key: string
  /** Group header shown above the first item of each group ('' = none). */
  group: string
  icon?: LucideIcon
  label: string
  hint?: string
  run: () => void
}

/** ⌘K command palette on a native <dialog> (top layer, no z-index needed).
 *  Same open/close mechanics as Modal.tsx — fully controlled, StrictMode-safe
 *  — but self-drawn: a search input over a grouped listbox. Focus stays in the
 *  input; ↑↓ move aria-activedescendant only. */
export function CommandPalette({ ctx }: { ctx: CommandCtx }): JSX.Element | null {
  const open = usePalette((s) => s.open)
  const close = usePalette((s) => s.close)
  const recents = useRecents((s) => s.recents)

  const ref = useRef<HTMLDialogElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      setQuery('')
      setActive(0)
      d.showModal()
      // React's autoFocus ran at mount (dialog closed, display:none) — focus
      // explicitly now that the dialog is up.
      inputRef.current?.focus()
    } else if (!open && d.open) {
      d.close()
    }
  }, [open])

  useEffect(() => setActive(0), [query])

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase()
    const out: Item[] = []
    const pushCmd = (cmd: AppCommand): void => {
      out.push({
        key: cmd.id,
        group: cmd.section,
        icon: cmd.section === '导航' ? NAV_ICONS.get(cmd.id) : ACTION_ICONS[cmd.id],
        label: cmd.title,
        hint: cmd.hint,
        run: () => runCommand(cmd.id, ctx)
      })
    }
    const rank = (cmds: AppCommand[]): AppCommand[] => {
      if (!q) return cmds
      return cmds
        .map((c) => ({ c, s: fuzzyScore(q, c.title, c.keywords) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.c)
    }
    for (const c of rank(PALETTE_COMMANDS.filter((c) => c.section === '导航'))) pushCmd(c)
    for (const c of rank(PALETTE_COMMANDS.filter((c) => c.section === '动作'))) pushCmd(c)
    // Recent topics: CJK titles, so plain substring — not fuzzy (see fuzzy.ts).
    const matched = q ? recents.filter((r) => r.title.toLowerCase().includes(q)) : recents
    for (const r of matched) {
      out.push({
        key: `recent-${r.id}`,
        group: '最近',
        icon: History,
        label: r.title,
        run: () => ctx.navigate(`/t/${r.id}`)
      })
    }
    if (q) {
      const term = query.trim()
      out.push({
        key: 'search-fallback',
        group: '',
        icon: Search,
        label: `搜索 “${term}”`,
        run: () => ctx.navigate('/search?q=' + encodeURIComponent(term))
      })
    }
    return out
  }, [query, recents, ctx])

  const safeActive = items.length === 0 ? -1 : Math.min(active, items.length - 1)

  useEffect(() => {
    if (safeActive < 0) return
    listRef.current
      ?.querySelector(`[data-index="${safeActive}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [safeActive])

  /** Close FIRST (dialog.close() drops [open] synchronously), then run — the
   *  runCommand dialog[open] guard would otherwise swallow the command. */
  function execute(item: Item): void {
    ref.current?.close()
    close()
    item.run()
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    const n = items.length
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (n > 0) setActive((safeActive + 1) % n)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (n > 0) setActive((safeActive - 1 + n) % n)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (safeActive >= 0) execute(items[safeActive])
    }
  }

  const onBackdrop = (e: MouseEvent<HTMLDialogElement>): void => {
    if (e.target === ref.current) close()
  }

  const optId = (i: number): string => `${listId}-opt-${i}`

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-label="命令面板"
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
      onClick={onBackdrop}
    >
      <div className={styles.panel}>
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="搜索命令、页面或话题…"
          autoFocus
          spellCheck={false}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-activedescendant={safeActive >= 0 ? optId(safeActive) : undefined}
        />
        <div ref={listRef} className={styles.list} role="listbox" id={listId} aria-label="结果">
          {items.length === 0 && <div className={styles.empty}>没有匹配项</div>}
          {items.map((it, i) => (
            <Fragment key={it.key}>
              {it.group && it.group !== items[i - 1]?.group && (
                <div className={styles.groupTitle} aria-hidden>
                  {it.group}
                </div>
              )}
              <div
                id={optId(i)}
                role="option"
                aria-selected={i === safeActive}
                data-index={i}
                className={`${styles.item} ${i === safeActive ? styles.itemActive : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => execute(it)}
              >
                {it.icon ? (
                  <it.icon size={16} className={styles.itemIcon} aria-hidden />
                ) : (
                  <span className={styles.itemIconPad} />
                )}
                <span className={styles.itemLabel}>{it.label}</span>
                {it.hint && <span className={styles.itemHint}>{it.hint}</span>}
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </dialog>
  )
}
