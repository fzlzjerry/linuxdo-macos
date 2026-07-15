import { useMemo, useState } from 'react'
import { BarChart3, Check, Loader2 } from 'lucide-react'
import { discourse } from '../../lib/discourse/client'
import { useAuth } from '../../store/auth'
import { toast } from '../../store/toast'
import { errorMessage } from '../../lib/errors'
import { compactNumber } from '../../lib/format'
import type { Post } from '../../lib/discourse/types'
import type { ParsedPoll } from './parsePolls'
import styles from './PollView.module.css'

export function PollView({ post, polls }: { post: Post; polls: ParsedPoll[] }): JSX.Element {
  return (
    <div className={styles.wrap}>
      {polls.map((p) => (
        <SinglePoll key={p.name} post={post} parsed={p} />
      ))}
    </div>
  )
}

function SinglePoll({ post, parsed }: { post: Post; parsed: ParsedPoll }): JSX.Element {
  const auth = useAuth()
  const structured = post.polls?.find((x) => x.name === parsed.name)

  // votes[optionId] = count; seeded from the structured poll when visible.
  const [votes, setVotes] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {}
    for (const o of structured?.options ?? []) if (o.votes != null) m[o.id] = o.votes
    return m
  })
  const [voters, setVoters] = useState<number>(structured?.voters ?? 0)
  const [myVotes, setMyVotes] = useState<string[]>(post.polls_votes?.[parsed.name] ?? [])
  const [selected, setSelected] = useState<Set<string>>(new Set(myVotes))
  const [busy, setBusy] = useState(false)
  const [showResults, setShowResults] = useState(
    parsed.results === 'always' || parsed.status === 'closed' || (post.polls_votes?.[parsed.name]?.length ?? 0) > 0
  )

  const isMultiple = parsed.type === 'multiple'
  const isClosed = parsed.status === 'closed'
  const hasVoted = myVotes.length > 0
  const canVote = post.can_vote !== false && !isClosed

  const total = useMemo(() => {
    const sum = Object.values(votes).reduce((a, b) => a + b, 0)
    return voters || sum
  }, [votes, voters])

  function toggle(id: string): void {
    if (!canVote) {
      setShowResults(true)
      return
    }
    if (!isMultiple) {
      void submit([id])
      return
    }
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (!parsed.max || next.size < parsed.max) next.add(id)
      return next
    })
  }

  async function submit(ids: string[]): Promise<void> {
    if (!auth.loggedIn) {
      toast.info('请先登录 linux.do')
      void auth.showLogin()
      return
    }
    if (ids.length === 0 || busy) return
    setBusy(true)
    try {
      const res = await discourse.votePoll(post.id, parsed.name, ids)
      const p = res.poll
      if (p?.options) {
        const m: Record<string, number> = {}
        for (const o of p.options) m[o.id] = o.votes ?? 0
        setVotes(m)
        if (p.voters != null) setVoters(p.voters)
      }
      setMyVotes(res.vote ?? ids)
      setSelected(new Set(res.vote ?? ids))
      setShowResults(true)
    } catch (e) {
      toast.error(errorMessage(e, '投票失败'))
    } finally {
      setBusy(false)
    }
  }

  const resultsVisible = showResults || parsed.results === 'always' || isClosed

  return (
    <section className={styles.poll} aria-label="投票">
      {parsed.title && <div className={styles.title}>{parsed.title}</div>}

      <div className={styles.options}>
        {parsed.options.map((o) => {
          const count = votes[o.id] ?? 0
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          const mine = myVotes.includes(o.id)
          const isSelected = selected.has(o.id)
          return (
            <button
              key={o.id}
              type="button"
              className={`${styles.option} ${mine ? styles.mine : ''} ${isSelected && !resultsVisible ? styles.selected : ''}`}
              onClick={() => toggle(o.id)}
              disabled={busy}
              aria-pressed={isSelected || mine}
            >
              {resultsVisible && <span className={styles.bar} style={{ width: `${pct}%` }} aria-hidden />}
              <span className={styles.optionInner}>
                <span className={styles.marker} data-multiple={isMultiple ? 'true' : undefined}>
                  {(mine || isSelected) && <Check size={12} strokeWidth={3} />}
                </span>
                <span className={styles.optionText}>{o.text}</span>
                {resultsVisible && (
                  <span className={styles.pct}>
                    {pct}%<span className={styles.pctCount}>· {compactNumber(count)}</span>
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      <div className={styles.footer}>
        <span className={styles.voters}>
          {total > 0 ? `${compactNumber(total)} 票` : '暂无投票'}
          {isClosed && ' · 已结束'}
        </span>
        <span className={styles.actions}>
          {isMultiple && canVote && !hasVoted && (
            <button
              type="button"
              className={styles.voteBtn}
              onClick={() => void submit([...selected])}
              disabled={busy || selected.size < (parsed.min || 1)}
            >
              {busy ? <Loader2 size={13} className="spin" /> : null}
              投票
            </button>
          )}
          {parsed.results !== 'always' && !isClosed && (
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => setShowResults((v) => !v)}
            >
              <BarChart3 size={13} />
              {resultsVisible ? '隐藏结果' : '查看结果'}
            </button>
          )}
        </span>
      </div>
    </section>
  )
}
