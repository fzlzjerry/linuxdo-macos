import type { ReactNode } from 'react'
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
import styles from './SettingsPage.module.css'

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
