import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Bell,
  Bookmark,
  CircleDot,
  FileText,
  Flame,
  LayoutGrid,
  Mail,
  Newspaper,
  PenSquare,
  Search,
  Settings,
  Sparkles,
  TrendingUp
} from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { NewTopicModal } from '../composer/NewTopicModal'
import { useAuth } from '../../store/auth'
import styles from './Sidebar.module.css'

interface NavItem {
  to: string
  label: string
  icon: JSX.Element
  badge?: number
}

export function Sidebar(): JSX.Element {
  const auth = useAuth()
  const [composing, setComposing] = useState(false)

  const feeds: NavItem[] = [
    { to: '/latest', label: '最新', icon: <Newspaper size={17} /> },
    { to: '/new', label: '新话题', icon: <Sparkles size={17} /> },
    { to: '/unread', label: '未读', icon: <CircleDot size={17} /> },
    { to: '/hot', label: '热门', icon: <Flame size={17} /> },
    { to: '/top', label: '排行', icon: <TrendingUp size={17} /> }
  ]

  const library: NavItem[] = [
    { to: '/categories', label: '分类', icon: <LayoutGrid size={17} /> },
    { to: '/bookmarks', label: '书签', icon: <Bookmark size={17} /> },
    { to: '/drafts', label: '草稿', icon: <FileText size={17} /> },
    { to: '/search', label: '搜索', icon: <Search size={17} /> }
  ]

  const me: NavItem[] = [
    { to: '/notifications', label: '通知', icon: <Bell size={17} />, badge: auth.unreadNotifications },
    { to: '/messages', label: '私信', icon: <Mail size={17} />, badge: auth.unreadPersonalMessages },
    { to: '/settings', label: '设置', icon: <Settings size={17} /> }
  ]

  function compose(): void {
    if (!auth.loggedIn) {
      void auth.showLogin()
      return
    }
    setComposing(true)
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.dragTop} data-tauri-drag-region />

      <div className={styles.composeWrap}>
        <button className={styles.compose} onClick={compose}>
          <PenSquare size={16} />
          发帖
        </button>
      </div>

      <nav className={styles.nav}>
        <Section items={feeds} />
        <Section title="资料库" items={library} />
        <Section title="我的" items={me} />
      </nav>

      <div className={styles.footer}>
        {auth.loggedIn ? (
          <NavLink to={auth.username ? `/u/${auth.username}` : '/latest'} className={styles.user}>
            <Avatar template={auth.avatarUrl} username={auth.username} name={auth.name} size={30} />
            <span className={styles.userMeta}>
              <span className={styles.userName}>{auth.name || auth.username}</span>
              <span className={styles.userHandle}>@{auth.username}</span>
            </span>
          </NavLink>
        ) : (
          <button className={styles.loginBtn} onClick={() => void auth.showLogin()}>
            登录 linux.do
          </button>
        )}
      </div>

      <NewTopicModal open={composing} onClose={() => setComposing(false)} />
    </aside>
  )
}

function Section({ title, items }: { title?: string; items: NavItem[] }): JSX.Element {
  return (
    <div className={styles.section}>
      {title && <div className={styles.sectionTitle}>{title}</div>}
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `${styles.item} ${isActive ? styles.active : ''}`}
        >
          <span className={styles.itemIcon}>{item.icon}</span>
          <span className={styles.itemLabel}>{item.label}</span>
          {!!item.badge && item.badge > 0 && <span className={styles.badge}>{item.badge}</span>}
        </NavLink>
      ))}
    </div>
  )
}
