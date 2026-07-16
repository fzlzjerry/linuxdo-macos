import type { LucideIcon } from 'lucide-react'
import {
  Award,
  Bell,
  Bot,
  BookOpenCheck,
  Bookmark,
  CalendarDays,
  CircleDot,
  FileText,
  Flame,
  LayoutGrid,
  Mail,
  MessageCircle,
  MessagesSquare,
  Newspaper,
  Search,
  Settings,
  Sparkles,
  TrendingUp,
  Trophy,
  Users
} from 'lucide-react'

export interface NavEntry {
  to: string
  label: string
  icon: LucideIcon
  /** Pinyin / english lookup terms for the command palette. */
  keywords: string[]
  badgeKey?: 'notifications' | 'pms'
}

export interface NavSection {
  title?: string
  items: NavEntry[]
}

/** Single source for the sidebar, the ⌘K palette and the native Go menu.
 *  QUICK_NAV order is mirrored by src-tauri/src/menu.rs (go.quick.N labels)
 *  — keep the two in sync when reordering. */
export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { to: '/latest', label: '最新', icon: Newspaper, keywords: ['zuixin', 'zx', 'latest'] },
      { to: '/new', label: '新话题', icon: Sparkles, keywords: ['xinhuati', 'xht', 'new'] },
      { to: '/unread', label: '未读', icon: CircleDot, keywords: ['weidu', 'wd', 'unread'] },
      { to: '/hot', label: '热门', icon: Flame, keywords: ['remen', 'rm', 'hot'] },
      { to: '/top', label: '排行', icon: TrendingUp, keywords: ['paihang', 'ph', 'top'] }
    ]
  },
  {
    title: '资料库',
    items: [
      { to: '/categories', label: '分类', icon: LayoutGrid, keywords: ['fenlei', 'fl', 'categories'] },
      { to: '/bookmarks', label: '书签', icon: Bookmark, keywords: ['shuqian', 'sq', 'bookmarks'] },
      { to: '/drafts', label: '草稿', icon: FileText, keywords: ['caogao', 'cg', 'drafts'] },
      { to: '/search', label: '搜索', icon: Search, keywords: ['sousuo', 'ss', 'search'] }
    ]
  },
  {
    title: '社区',
    items: [
      { to: '/chat', label: '聊天', icon: MessageCircle, keywords: ['liaotian', 'lt', 'chat'] },
      { to: '/ai', label: 'AI 机器人', icon: Bot, keywords: ['ai', 'jiqiren', 'bot'] },
      { to: '/leaderboard', label: '积分榜', icon: Trophy, keywords: ['jifenbang', 'jfb', 'leaderboard'] },
      { to: '/events', label: '活动', icon: CalendarDays, keywords: ['huodong', 'hd', 'events'] },
      { to: '/groups', label: '群组', icon: Users, keywords: ['qunzu', 'qz', 'groups'] },
      { to: '/badges', label: '徽章', icon: Award, keywords: ['huizhang', 'hz', 'badges'] }
    ]
  },
  {
    title: '我的',
    items: [
      { to: '/posted', label: '我的帖子', icon: MessagesSquare, keywords: ['wodetiezi', 'wdtz', 'posted'] },
      { to: '/read', label: '已读', icon: BookOpenCheck, keywords: ['yidu', 'yd', 'read'] },
      {
        to: '/notifications',
        label: '通知',
        icon: Bell,
        keywords: ['tongzhi', 'tz', 'notifications'],
        badgeKey: 'notifications'
      },
      {
        to: '/messages',
        label: '私信',
        icon: Mail,
        keywords: ['sixin', 'sx', 'messages'],
        badgeKey: 'pms'
      },
      { to: '/settings', label: '设置', icon: Settings, keywords: ['shezhi', 'sz', 'settings'] }
    ]
  }
]

const byPath = new Map(NAV_SECTIONS.flatMap((s) => s.items).map((i) => [i.to, i]))

/** ⌘1-9 targets: the five feeds, then the highest-traffic destinations. */
export const QUICK_NAV: NavEntry[] = [
  '/latest',
  '/new',
  '/unread',
  '/hot',
  '/top',
  '/categories',
  '/chat',
  '/notifications',
  '/messages'
].map((to) => byPath.get(to)!)
