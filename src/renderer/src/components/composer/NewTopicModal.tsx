import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '../ui/Modal'
import { Composer } from './Composer'
import { useCategories } from '../../lib/discourse/queries'
import { discourse } from '../../lib/discourse/client'
import { toast } from '../../store/toast'
import styles from './NewTopicModal.module.css'

interface Props {
  open: boolean
  onClose: () => void
}

export function NewTopicModal({ open, onClose }: Props): JSX.Element {
  const navigate = useNavigate()
  const { data } = useCategories()
  const categories = (data?.category_list.categories ?? []).filter((c) => !c.parent_category_id)

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<number | ''>('')
  const [tags, setTags] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(raw: string): Promise<void> {
    if (title.trim().length < 3) {
      toast.error('标题太短了')
      return
    }
    if (category === '') {
      toast.error('请选择一个分类')
      return
    }
    setSubmitting(true)
    try {
      const post = await discourse.createTopic({
        title: title.trim(),
        raw,
        category: Number(category),
        tags: tags
          .split(/[,，\s]+/)
          .map((t) => t.trim())
          .filter(Boolean)
      })
      toast.success('话题已发布')
      onClose()
      setTitle('')
      setTags('')
      setCategory('')
      if (post.topic_id) navigate('/t/' + post.topic_id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '发布失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="发布新话题" width={760}>
      <div className={styles.form}>
        <input
          className={styles.title}
          placeholder="标题"
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className={styles.row}>
          <select
            className={styles.select}
            value={category}
            onChange={(e) => setCategory(e.target.value === '' ? '' : Number(e.target.value))}
          >
            <option value="">选择分类…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            className={styles.tags}
            placeholder="标签（用逗号分隔，可选）"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>
        <Composer
          submitting={submitting}
          submitLabel="发布"
          minHeight={220}
          placeholder="正文…（支持 Markdown）"
          onCancel={onClose}
          onSubmit={(raw) => void submit(raw)}
        />
      </div>
    </Modal>
  )
}
