import { useState } from 'react'
import { Rocket, X } from 'lucide-react'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { discourse } from '../../lib/discourse/client'
import type { Boost, Post } from '../../lib/discourse/types'
import { useAuth } from '../../store/auth'
import { toast } from '../../store/toast'
import { CookedContent } from './CookedContent'
import styles from './BoostSection.module.css'

const ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPE[c])
}

/** The discourse-boosts create endpoint returns an unverified shape; try to read a
 *  real boost out of it, otherwise the caller falls back to a local optimistic chip. */
function boostFromResponse(resp: unknown): Boost | null {
  if (!resp || typeof resp !== 'object') return null
  const outer = resp as Record<string, unknown>
  const node = (
    outer.boost && typeof outer.boost === 'object' ? outer.boost : outer
  ) as Record<string, unknown>
  const { id, cooked, user } = node
  if (typeof id !== 'number' || typeof cooked !== 'string' || !user || typeof user !== 'object') {
    return null
  }
  return {
    id,
    cooked,
    can_delete: typeof node.can_delete === 'boolean' ? node.can_delete : true,
    can_flag: typeof node.can_flag === 'boolean' ? node.can_flag : undefined,
    user: user as Boost['user']
  }
}

/** Displays a post's boosts (🚀) and, when permitted, lets the viewer add one.
 *  Owns the list + create state so PostView only has to render this once. */
export function BoostSection({ post }: { post: Post }): JSX.Element | null {
  const auth = useAuth()
  const [boosts, setBoosts] = useState<Boost[]>(post.boosts ?? [])
  const [open, setOpen] = useState(false)
  const [raw, setRaw] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [boosted, setBoosted] = useState(false)

  // One boost per user per post; hide the trigger once the server accepts ours.
  const canBoost = post.can_boost !== false && !boosted

  function guard(): boolean {
    if (!auth.loggedIn) {
      toast.info('请先登录 linux.do')
      void auth.showLogin()
      return false
    }
    return true
  }

  function openModal(): void {
    if (!guard()) return
    setOpen(true)
  }

  function closeModal(): void {
    if (submitting) return
    setOpen(false)
    setRaw('')
  }

  async function submit(): Promise<void> {
    const text = raw.trim()
    if (!text || submitting) return
    setSubmitting(true)
    try {
      const resp = await discourse.createBoost(post.id, text)
      const fallback: Boost = {
        id: -Date.now(),
        cooked: `<p>${escapeHtml(text)}</p>`,
        can_delete: true,
        user: { id: 0, username: auth.username ?? '', name: auth.name }
      }
      const created = boostFromResponse(resp) ?? fallback
      setBoosts((prev) => [...prev, created])
      setBoosted(true)
      toast.success('已助推 🚀')
      setOpen(false)
      setRaw('')
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : '助推失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function remove(boost: Boost): Promise<void> {
    const prev = boosts
    setBoosts((bs) => bs.filter((b) => b.id !== boost.id))
    // Local optimistic chips (synthetic negative id) never reached the server.
    if (boost.id <= 0) return
    try {
      await discourse.deleteBoost(boost.id)
      setBoosted(false)
      toast.info('已移除助推')
    } catch (e) {
      setBoosts(prev)
      toast.error(e instanceof Error && e.message ? e.message : '操作失败')
    }
  }

  if (boosts.length === 0 && !canBoost) return null

  return (
    <section className={styles.wrap}>
      {boosts.length > 0 && (
        <>
          <div className={styles.count}>
            <Rocket size={13} />
            <span>{boosts.length}</span>
          </div>
          <ul className={styles.list}>
            {boosts.map((boost) => (
              <li key={boost.id} className={styles.item}>
                <Avatar
                  template={boost.user.avatar_template}
                  username={boost.user.username}
                  name={boost.user.name}
                  size={20}
                />
                <div className={styles.boostBody}>
                  <CookedContent html={boost.cooked} />
                </div>
                {boost.can_delete && (
                  <button
                    className={styles.remove}
                    onClick={() => void remove(boost)}
                    title="移除助推"
                    aria-label="移除助推"
                  >
                    <X size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {canBoost && (
        <button className={styles.trigger} onClick={openModal} title="助推 (Boost)">
          <Rocket size={14} />
          <span>助推</span>
        </button>
      )}

      <Modal
        open={open}
        onClose={closeModal}
        title="助推 (Boost)"
        width={440}
        footer={
          <>
            <Button variant="ghost" onClick={closeModal} disabled={submitting}>
              取消
            </Button>
            <Button
              variant="primary"
              icon={<Rocket size={15} />}
              loading={submitting}
              disabled={!raw.trim()}
              onClick={() => void submit()}
            >
              发送
            </Button>
          </>
        }
      >
        <textarea
          className={styles.input}
          value={raw}
          placeholder="写一句助推…"
          rows={3}
          autoFocus
          disabled={submitting}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              void submit()
            }
          }}
        />
      </Modal>
    </section>
  )
}
