import { useState, type ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'
import { Toolbar } from '../../components/window/Toolbar'
import { PageScaffold } from '../../components/window/PageScaffold'
import { Segmented } from '../../components/ui/Segmented'
import { Button } from '../../components/ui/Button'
import { Avatar } from '../../components/ui/Avatar'
import { useSettings } from '../../store/settings'
import type { ThemeMode } from '../../store/settings'
import { useAuth } from '../../store/auth'
import { toast } from '../../store/toast'
import { useUserPreferences } from '../../lib/discourse/queries'
import { discourse } from '../../lib/discourse/client'
import { errorMessage } from '../../lib/errors'
import styles from './SettingsPage.module.css'

const ONOFF: { value: string; label: string }[] = [
  { value: 'on', label: '开' },
  { value: 'off', label: '关' }
]
const PREF_TOGGLES: { field: string; label: string; description: string }[] = [
  { field: 'email_digests', label: '邮件摘要', description: '不活跃时通过邮件接收热门内容摘要' },
  { field: 'allow_private_messages', label: '允许私信', description: '允许其他用户给你发送私信' },
  { field: 'hide_presence', label: '隐藏在线状态', description: '不向他人显示你的在线状态' },
  { field: 'external_links_in_new_tab', label: '外链新标签打开', description: '在新标签页打开站外链接' },
  { field: 'notify_on_linked_posts', label: '被链接时通知', description: '有人链接到你的帖子时通知你' }
]

function PreferencesSection({ username }: { username: string }): JSX.Element {
  const { data, isLoading } = useUserPreferences(username)
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const valueOf = (field: string): boolean => overrides[field] ?? Boolean(data?.[field])

  async function toggle(field: string, next: boolean): Promise<void> {
    setOverrides((o) => ({ ...o, [field]: next }))
    setBusy(field)
    try {
      await discourse.updatePreference(username, field, next)
      toast.success('已保存')
    } catch (e) {
      setOverrides((o) => ({ ...o, [field]: !next }))
      toast.error(errorMessage(e, '保存失败'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>偏好</h2>
      <div className={styles.card}>
        {isLoading ? (
          <div className={styles.row}>
            <span className={styles.rowLabel}>加载中…</span>
          </div>
        ) : (
          PREF_TOGGLES.map((p) => (
            <Row key={p.field} label={p.label} description={p.description}>
              <Segmented
                options={ONOFF}
                value={valueOf(p.field) ? 'on' : 'off'}
                onChange={(v) => void toggle(p.field, v === 'on')}
                aria-label={p.label}
                disabled={busy === p.field}
              />
            </Row>
          ))
        )}
      </div>
    </section>
  )
}

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' }
]

const FONT_OPTIONS: { value: string; label: string }[] = [
  { value: '0.9', label: '小' },
  { value: '1', label: '标准' },
  { value: '1.15', label: '大' },
  { value: '1.3', label: '特大' }
]

const DENSITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'comfortable', label: '舒适' },
  { value: 'compact', label: '紧凑' }
]

const APP_NAME = 'LinuxDO'
const APP_VERSION = '0.1.0'

export function SettingsPage(): JSX.Element {
  const { theme, fontScale, compactList, setTheme, setFontScale, setCompactList } = useSettings()
  const auth = useAuth()

  const handleLogout = async (): Promise<void> => {
    await auth.logout()
    toast.info('已退出登录')
  }

  return (
    <PageScaffold toolbar={<Toolbar title="设置" />}>
      <div className={styles.wrap}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>外观</h2>
          <div className={styles.card}>
            <Row label="主题" description="选择浅色、深色或跟随系统外观">
              <Segmented options={THEME_OPTIONS} value={theme} onChange={setTheme} aria-label="主题" />
            </Row>
            <Row label="字体大小" description="调整界面文字的整体大小">
              <Segmented
                options={FONT_OPTIONS}
                value={String(fontScale)}
                onChange={(v) => setFontScale(Number(v))}
                aria-label="字体大小"
              />
            </Row>
            <Row label="列表密度" description="列表行高与间距，立即生效">
              <Segmented
                options={DENSITY_OPTIONS}
                value={compactList ? 'compact' : 'comfortable'}
                onChange={(v) => setCompactList(v === 'compact')}
                aria-label="列表密度"
              />
            </Row>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>账户</h2>
          <div className={styles.card}>
            {auth.loggedIn ? (
              <div className={styles.account}>
                <div className={styles.accountUser}>
                  <Avatar
                    template={auth.avatarUrl}
                    username={auth.username}
                    name={auth.name}
                    size={40}
                  />
                  <div className={styles.accountMeta}>
                    <span className={styles.accountName}>{auth.name || auth.username}</span>
                    <span className={styles.accountHandle}>@{auth.username}</span>
                  </div>
                </div>
                <Button variant="danger" size="sm" onClick={() => void handleLogout()}>
                  退出登录
                </Button>
              </div>
            ) : (
              <Row label="未登录" description="登录后可同步你的账户、通知与私信">
                <Button variant="primary" size="sm" onClick={() => void auth.showLogin()}>
                  登录 linux.do
                </Button>
              </Row>
            )}
          </div>
        </section>

        {auth.loggedIn && auth.username && <PreferencesSection username={auth.username} />}

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>关于</h2>
          <div className={styles.card}>
            <Row label="应用">
              <span className={styles.value}>{APP_NAME}</span>
            </Row>
            <Row label="版本">
              <span className={styles.value}>{APP_VERSION}</span>
            </Row>
            <p className={styles.note}>linux.do 第三方 macOS 客户端</p>
            <div className={styles.buttonRow}>
              <Button
                variant="secondary"
                size="sm"
                icon={<ExternalLink size={15} />}
                onClick={() => void window.api?.openExternal('https://linux.do')}
              >
                在浏览器中打开 linux.do
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<ExternalLink size={15} />}
                onClick={() => void window.api?.openExternal('https://connect.linux.do')}
              >
                连接 Connect
              </Button>
            </div>
          </div>
        </section>
      </div>
    </PageScaffold>
  )
}

function Row({
  label,
  description,
  children
}: {
  label: string
  description?: string
  children: ReactNode
}): JSX.Element {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <span className={styles.rowLabel}>{label}</span>
        {description && <span className={styles.rowDesc}>{description}</span>}
      </div>
      <div className={styles.rowControl}>{children}</div>
    </div>
  )
}
