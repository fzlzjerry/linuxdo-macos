import { useRef, useState, type KeyboardEvent } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { Bold, Code, Italic, Link2, List, Quote } from 'lucide-react'
import { Button } from '../ui/Button'
import styles from './Composer.module.css'

marked.setOptions({ gfm: true, breaks: true })

interface Props {
  onSubmit: (raw: string) => void | Promise<void>
  onCancel?: () => void
  submitting?: boolean
  placeholder?: string
  submitLabel?: string
  initialValue?: string
  autoFocus?: boolean
  minHeight?: number
}

type Tab = 'write' | 'preview'

export function Composer({
  onSubmit,
  onCancel,
  submitting = false,
  placeholder = '写点什么…（支持 Markdown）',
  submitLabel = '发布',
  initialValue = '',
  autoFocus = false,
  minHeight = 140
}: Props): JSX.Element {
  const [text, setText] = useState(initialValue)
  const [tab, setTab] = useState<Tab>('write')
  const ref = useRef<HTMLTextAreaElement>(null)

  const wrap = (before: string, after = before): void => {
    const el = ref.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e, value } = el
    const selected = value.slice(s, e)
    const next = value.slice(0, s) + before + selected + after + value.slice(e)
    setText(next)
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = s + before.length
      el.selectionEnd = e + before.length
    })
  }

  const prefixLines = (prefix: string): void => {
    const el = ref.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e, value } = el
    const start = value.lastIndexOf('\n', s - 1) + 1
    const block = value.slice(start, e)
    const replaced = block
      .split('\n')
      .map((l) => prefix + l)
      .join('\n')
    setText(value.slice(0, start) + replaced + value.slice(e))
  }

  const canSubmit = text.trim().length > 0 && !submitting

  const onKeyDown = (ev: KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter' && canSubmit) {
      ev.preventDefault()
      void onSubmit(text)
    }
  }

  const previewHtml = tab === 'preview' ? DOMPurify.sanitize(marked.parse(text || '_（空）_') as string) : ''

  return (
    <div className={styles.composer}>
      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          <button className={tab === 'write' ? styles.tabActive : styles.tab} onClick={() => setTab('write')}>
            编辑
          </button>
          <button
            className={tab === 'preview' ? styles.tabActive : styles.tab}
            onClick={() => setTab('preview')}
          >
            预览
          </button>
        </div>
        {tab === 'write' && (
          <div className={styles.tools}>
            <button title="粗体" onClick={() => wrap('**')}>
              <Bold size={15} />
            </button>
            <button title="斜体" onClick={() => wrap('*')}>
              <Italic size={15} />
            </button>
            <button title="行内代码" onClick={() => wrap('`')}>
              <Code size={15} />
            </button>
            <button title="链接" onClick={() => wrap('[', '](url)')}>
              <Link2 size={15} />
            </button>
            <button title="引用" onClick={() => prefixLines('> ')}>
              <Quote size={15} />
            </button>
            <button title="列表" onClick={() => prefixLines('- ')}>
              <List size={15} />
            </button>
          </div>
        )}
      </div>

      {tab === 'write' ? (
        <textarea
          ref={ref}
          className={styles.textarea}
          style={{ minHeight }}
          value={text}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
      ) : (
        <div
          className={`${styles.preview} cooked`}
          style={{ minHeight }}
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      )}

      <div className={styles.actions}>
        <span className={styles.hint}>⌘↵ 发布</span>
        <div className={styles.actionButtons}>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={submitting}>
              取消
            </Button>
          )}
          <Button variant="primary" loading={submitting} disabled={!canSubmit} onClick={() => void onSubmit(text)}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
