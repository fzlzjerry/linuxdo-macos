import { useState } from 'react'
import { Bell, BellDot, BellOff, BellRing } from 'lucide-react'
import { Menu, type MenuItem } from '../../components/ui/Menu'
import { discourse } from '../../lib/discourse/client'
import { useAuth } from '../../store/auth'
import { toast } from '../../store/toast'
import { errorMessage } from '../../lib/errors'
import type { NotificationLevel } from '../../lib/discourse/types'

const LEVELS: {
  level: NotificationLevel
  label: string
  desc: string
  icon: JSX.Element
}[] = [
  { level: 3, label: '关注', desc: '每条新回复都提醒', icon: <BellRing size={15} /> },
  { level: 2, label: '追踪', desc: '记录未读数，被提及时提醒', icon: <BellDot size={15} /> },
  { level: 1, label: '普通', desc: '仅在被@或回复时提醒', icon: <Bell size={15} /> },
  { level: 0, label: '静音', desc: '不提醒，也不计入未读', icon: <BellOff size={15} /> }
]

/** Topic-level notification level control (关注/追踪/普通/静音). */
export function TopicNotificationMenu({
  topicId,
  initial
}: {
  topicId: number
  initial?: NotificationLevel
}): JSX.Element {
  const auth = useAuth()
  const [level, setLevel] = useState<NotificationLevel>(initial ?? 1)
  const [busy, setBusy] = useState(false)

  async function set(next: NotificationLevel): Promise<void> {
    if (!auth.loggedIn) {
      toast.info('请先登录 linux.do')
      void auth.showLogin()
      return
    }
    if (next === level || busy) return
    const prev = level
    setLevel(next)
    setBusy(true)
    try {
      await discourse.setTopicNotificationLevel(topicId, next)
      toast.success(`已设为「${LEVELS.find((l) => l.level === next)?.label}」`)
    } catch (e) {
      setLevel(prev)
      toast.error(errorMessage(e, '设置失败'))
    } finally {
      setBusy(false)
    }
  }

  const current = LEVELS.find((l) => l.level === level) ?? LEVELS[2]
  const items: MenuItem[] = LEVELS.map((l) => ({
    key: String(l.level),
    label: l.label,
    description: l.desc,
    icon: l.icon,
    active: l.level === level,
    onSelect: () => void set(l.level)
  }))

  return (
    <Menu
      label={`通知级别：${current.label}`}
      trigger={current.icon}
      triggerActive={level !== 1}
      items={items}
      width={248}
    />
  )
}
