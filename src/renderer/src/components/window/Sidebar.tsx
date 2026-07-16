import { useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { LogIn, PenSquare } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { NewTopicModal } from '../composer/NewTopicModal'
import { NAV_SECTIONS, type NavEntry } from '../../lib/nav'
import { useAuth } from '../../store/auth'
import { useComposerStore } from '../../store/composer'
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth,
  useSettings
} from '../../store/settings'
import styles from './Sidebar.module.css'

export function Sidebar(): JSX.Element {
  const auth = useAuth()
  const composing = useComposerStore((s) => s.newTopicOpen)
  const openNewTopic = useComposerStore((s) => s.openNewTopic)
  const closeNewTopic = useComposerStore((s) => s.closeNewTopic)
  const collapsed = useSettings((s) => s.sidebarCollapsed)

  const badges: Record<'notifications' | 'pms', number | undefined> = {
    notifications: auth.unreadNotifications,
    pms: auth.unreadPersonalMessages
  }

  return (
    // "deep": empty sidebar background drags the window (macOS convention);
    // nav links / buttons block it automatically via Tauri's drag script.
    <aside
      className={styles.sidebar}
      data-tauri-drag-region="deep"
      data-collapsed={collapsed || undefined}
    >
      <div className={styles.dragTop} />

      <div className={styles.composeWrap}>
        {collapsed ? (
          <Button
            variant="primary"
            className={styles.iconOnly}
            icon={<PenSquare size={16} />}
            aria-label="发帖"
            title="发帖"
            onClick={openNewTopic}
          />
        ) : (
          <Button
            variant="primary"
            className={styles.fullWidth}
            icon={<PenSquare size={16} />}
            onClick={openNewTopic}
          >
            发帖
          </Button>
        )}
      </div>

      <nav className={styles.nav}>
        {NAV_SECTIONS.map((section, i) => (
          <Section
            key={section.title ?? i}
            title={section.title}
            items={section.items}
            badges={badges}
            collapsed={collapsed}
          />
        ))}
      </nav>

      <div className={styles.footer}>
        {auth.loggedIn ? (
          <NavLink
            to={auth.username ? `/u/${auth.username}` : '/latest'}
            className={styles.user}
            title={collapsed ? auth.name || auth.username : undefined}
          >
            <Avatar template={auth.avatarUrl} username={auth.username} name={auth.name} size={30} />
            <span className={styles.userMeta}>
              <span className={styles.userName}>{auth.name || auth.username}</span>
              <span className={styles.userHandle}>@{auth.username}</span>
            </span>
          </NavLink>
        ) : collapsed ? (
          <Button
            variant="primary"
            className={styles.iconOnly}
            icon={<LogIn size={16} />}
            aria-label="登录 linux.do"
            title="登录 linux.do"
            onClick={() => void auth.showLogin()}
          />
        ) : (
          <Button
            variant="primary"
            className={styles.fullWidth}
            onClick={() => void auth.showLogin()}
          >
            登录 linux.do
          </Button>
        )}
      </div>

      {!collapsed && <ResizeHandle />}

      <NewTopicModal open={composing} onClose={closeNewTopic} />
    </aside>
  )
}

/** 4px grab strip on the sidebar's right edge. During a drag the width is
 *  written straight to the --sidebar-col CSS var (no store => no per-frame
 *  localStorage writes); the final value is committed to the store on release. */
function ResizeHandle(): JSX.Element {
  const sidebarWidth = useSettings((s) => s.sidebarWidth)
  const setSidebarWidth = useSettings((s) => s.setSidebarWidth)
  const drag = useRef<{ startX: number; startWidth: number; width: number } | null>(null)

  const applyLive = (width: number): number => {
    const w = clampSidebarWidth(width)
    document.documentElement.style.setProperty('--sidebar-col', `${w}px`)
    return w
  }

  const commit = (): void => {
    const d = drag.current
    if (!d) return
    drag.current = null
    setSidebarWidth(d.width)
  }

  return (
    <div
      className={styles.resizeHandle}
      // The sidebar is a deep drag region; without an explicit opt-out this
      // strip would drag the whole window instead of resizing.
      data-tauri-drag-region="false"
      role="separator"
      aria-orientation="vertical"
      aria-label="调整侧栏宽度"
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      aria-valuenow={sidebarWidth}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        const startWidth = useSettings.getState().sidebarWidth
        drag.current = { startX: e.clientX, startWidth, width: startWidth }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        d.width = applyLive(d.startWidth + (e.clientX - d.startX))
      }}
      onPointerUp={commit}
      onPointerCancel={commit}
      onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}
      onKeyDown={(e) => {
        let next: number | null = null
        if (e.key === 'ArrowLeft') next = sidebarWidth - 16
        else if (e.key === 'ArrowRight') next = sidebarWidth + 16
        else if (e.key === 'Home') next = SIDEBAR_MIN_WIDTH
        else if (e.key === 'End') next = SIDEBAR_MAX_WIDTH
        if (next !== null) {
          e.preventDefault()
          setSidebarWidth(next)
        }
      }}
    />
  )
}

function Section({
  title,
  items,
  badges,
  collapsed
}: {
  title?: string
  items: NavEntry[]
  badges: Record<'notifications' | 'pms', number | undefined>
  collapsed: boolean
}): JSX.Element {
  return (
    <div className={styles.section}>
      {title && <div className={styles.sectionTitle}>{title}</div>}
      {items.map((item) => {
        const badge = item.badgeKey ? badges[item.badgeKey] : undefined
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `${styles.item} ${isActive ? styles.active : ''}`}
            // Collapsed rail shrinks the badge to a dot — the tooltip has to
            // carry the count, or sighted users lose the number entirely.
            title={
              collapsed
                ? badge && badge > 0
                  ? `${item.label} · ${badge} 条未读`
                  : item.label
                : undefined
            }
          >
            <span className={styles.itemIcon}>
              <Icon size={17} />
            </span>
            <span className={styles.itemLabel}>{item.label}</span>
            {!!badge && badge > 0 && <span className={styles.badge}>{badge}</span>}
          </NavLink>
        )
      })}
    </div>
  )
}
