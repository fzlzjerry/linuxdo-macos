import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { Toolbar } from '../../components/window/Toolbar'
import { PageScaffold } from '../../components/window/PageScaffold'
import { Avatar } from '../../components/ui/Avatar'
import { CategoryBadge } from '../../components/ui/CategoryBadge'
import { Tag } from '../../components/ui/Tag'
import { EmptyState, ErrorState, Spinner } from '../../components/ui/states'
import { useSearch } from '../../lib/discourse/queries'
import { useScrollMemory } from '../../lib/useScrollMemory'
import { useAuth } from '../../store/auth'
import { relativeTime } from '../../lib/format'
import { tagKey, tagText } from '../../lib/discourse/types'
import styles from './SearchPage.module.css'

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
  '&hellip;': '…',
  '&mdash;': '—',
  '&ndash;': '–',
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&lsquo;': '‘',
  '&rsquo;': '’'
}

/** Strip HTML tags from a Discourse blurb / fancy_title and render it as plain text. */
function toPlainText(html: string | undefined): string {
  if (!html) return ''
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z]+;|&#\d+;/gi, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

// Survives unmount so returning to /search restores the last search session.
let lastSearchInput = ''

export function SearchPage(): JSX.Element {
  const [input, setInput] = useState(lastSearchInput)
  const [term, setTerm] = useState(lastSearchInput)
  const navigate = useNavigate()
  const auth = useAuth()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Debounce the raw input into the query term (~350ms).
  useEffect(() => {
    lastSearchInput = input
    const id = setTimeout(() => setTerm(input), 350)
    return () => clearTimeout(id)
  }, [input])

  const active = term.trim().length > 1
  const { data, isLoading, isError, error, refetch } = useSearch(term, active)

  useScrollMemory(scrollRef, `search:${term}`, active && !isLoading && !!data)

  const topics = data?.topics ?? []
  const posts = data?.posts ?? []
  const users = data?.users ?? []
  const hasResults = topics.length > 0 || posts.length > 0 || users.length > 0

  return (
    <PageScaffold ref={scrollRef} toolbar={<Toolbar title="搜索" />}>
      <div className={styles.searchBar}>
        <div className={styles.inputWrap}>
          <Search size={16} className={styles.searchIcon} aria-hidden />
          <input
            className={styles.input}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="搜索话题、帖子、用户…"
            autoFocus
            spellCheck={false}
            aria-label="搜索"
          />
          {input && (
            <button
              type="button"
              className={styles.clear}
              onClick={() => setInput('')}
              aria-label="清除"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {!active ? (
        <EmptyState
          icon={<Search size={26} strokeWidth={1.6} />}
          title="输入关键词开始搜索"
          description="可搜索话题、帖子和用户。"
        />
      ) : isError ? (
        <ErrorState
          error={error}
          onRetry={() => void refetch()}
          onLogin={() => void auth.showLogin()}
        />
      ) : isLoading ? (
        <Spinner label="搜索中…" />
      ) : !hasResults ? (
        <EmptyState
          icon={<Search size={26} strokeWidth={1.6} />}
          title="没有找到结果"
          description="试试其他关键词。"
        />
      ) : (
        <div className={styles.results}>
          {topics.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionTitle}>话题</span>
                <span className={styles.sectionCount}>{topics.length}</span>
              </div>
              {topics.map((t) => (
                <button
                  key={t.id}
                  className={styles.row}
                  onClick={() => navigate(`/t/${t.id}`)}
                  aria-label={t.title}
                >
                  <div className={styles.main}>
                    <span className={styles.title}>
                      {toPlainText(t.fancy_title) || t.title}
                    </span>
                    <div className={styles.metaLine}>
                      <CategoryBadge categoryId={t.category_id} />
                      {t.tags?.slice(0, 3).map((tag) => (
                        <Tag key={tagKey(tag)}>{tagText(tag)}</Tag>
                      ))}
                      <span className={styles.time}>
                        {relativeTime(t.bumped_at || t.created_at)}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </section>
          )}

          {posts.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionTitle}>帖子</span>
                <span className={styles.sectionCount}>{posts.length}</span>
              </div>
              {posts.map((p) => (
                <button
                  key={p.id}
                  className={`${styles.row} ${styles.rowTop}`}
                  onClick={() => navigate(`/t/${p.topic_id}`)}
                  aria-label={p.username ? `${p.username} 的帖子` : '帖子'}
                >
                  <Avatar
                    template={p.avatar_template}
                    username={p.username}
                    name={p.name}
                    size={36}
                  />
                  <div className={styles.postMain}>
                    <div className={styles.postHead}>
                      <span className={styles.username}>{p.username || '匿名'}</span>
                      <span className={styles.time}>{relativeTime(p.created_at)}</span>
                    </div>
                    {toPlainText(p.blurb) && (
                      <p className={styles.blurb}>{toPlainText(p.blurb)}</p>
                    )}
                  </div>
                </button>
              ))}
            </section>
          )}

          {users.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionTitle}>用户</span>
                <span className={styles.sectionCount}>{users.length}</span>
              </div>
              {users.map((u) => (
                <button
                  key={u.id}
                  className={styles.row}
                  onClick={() => navigate(`/u/${u.username}`)}
                  aria-label={u.name || u.username}
                >
                  <Avatar
                    template={u.avatar_template}
                    username={u.username}
                    name={u.name}
                    size={40}
                  />
                  <div className={styles.userMain}>
                    <span className={styles.userName}>{u.name || u.username}</span>
                    <span className={styles.userHandle}>@{u.username}</span>
                  </div>
                </button>
              ))}
            </section>
          )}
        </div>
      )}
    </PageScaffold>
  )
}
