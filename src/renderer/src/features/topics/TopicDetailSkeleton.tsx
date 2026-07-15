import { Skeleton } from '../../components/ui/states'
import styles from './TopicPage.module.css'

export function TopicDetailSkeleton(): JSX.Element {
  return (
    <div className={styles.reader} aria-hidden>
      <header className={styles.head}>
        <Skeleton width="80%" height={26} />
        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          <Skeleton width={90} height={14} />
          <Skeleton width={60} height={14} />
        </div>
      </header>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ padding: '20px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
            <Skeleton width={40} height={40} radius={999} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Skeleton width={120} height={13} />
              <Skeleton width={80} height={11} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 52 }}>
            <Skeleton width="96%" height={13} />
            <Skeleton width="90%" height={13} />
            <Skeleton width="70%" height={13} />
          </div>
        </div>
      ))}
    </div>
  )
}
