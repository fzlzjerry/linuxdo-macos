import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent
} from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import {
  Bold,
  Code,
  EyeOff,
  Heading,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Quote,
  Smile,
  SquareCode,
  Strikethrough,
  Table
} from 'lucide-react'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { Segmented } from '../ui/Segmented'
import { discourse } from '../../lib/discourse/client'
import type { UploadResult } from '../../lib/discourse/client'
import { absolutize } from '../../lib/discourse/urls'
import { useAuth } from '../../store/auth'
import { toast } from '../../store/toast'
import { EmojiPicker } from './EmojiPicker'
import { InlineAutocomplete, type InlineAutocompleteHandle } from './InlineAutocomplete'
import styles from './Composer.module.css'

marked.setOptions({ gfm: true, breaks: true })

interface Props {
  onSubmit: (raw: string) => void | Promise<void>
  onCancel?: () => void
  /** Fires when the content diverges from / returns to initialValue. */
  onDirtyChange?: (dirty: boolean) => void
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
  onDirtyChange,
  submitting = false,
  placeholder = '写点什么…（支持 Markdown）',
  submitLabel = '发布',
  initialValue = '',
  autoFocus = false,
  minHeight = 140
}: Props): JSX.Element {
  const auth = useAuth()
  const [text, setText] = useState(initialValue)
  const dirtyRef = useRef(false)

  useEffect(() => {
    const dirty = text.trim() !== initialValue.trim()
    if (dirty !== dirtyRef.current) {
      dirtyRef.current = dirty
      onDirtyChange?.(dirty)
    }
  }, [text, initialValue, onDirtyChange])
  const [tab, setTab] = useState<Tab>('write')
  const [uploading, setUploading] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [emojiAnchor, setEmojiAnchor] = useState<{ left: number; top: number }>({ left: 0, top: 0 })
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const emojiBtnRef = useRef<HTMLSpanElement>(null)
  const acRef = useRef<InlineAutocompleteHandle>(null)
  // short_url → absolute url, so the preview can render freshly uploaded images.
  const uploadMap = useRef(new Map<string, string>())

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

  const insertAtCaret = (snippet: string): void => {
    const el = ref.current
    if (!el) {
      setText((t) => t + snippet)
      return
    }
    const { selectionStart: s, selectionEnd: e } = el
    setText((v) => v.slice(0, s) + snippet + v.slice(e))
    requestAnimationFrame(() => {
      el.focus()
      const c = s + snippet.length
      el.selectionStart = c
      el.selectionEnd = c
    })
  }

  const replaceRange = (start: number, end: number, insert: string): void => {
    const el = ref.current
    if (!el) return
    const value = el.value
    setText(value.slice(0, start) + insert + value.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      const c = start + insert.length
      el.selectionStart = c
      el.selectionEnd = c
    })
  }

  const insertTable = (): void => {
    insertAtCaret('\n| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |\n| 内容 | 内容 |\n')
  }

  const guardAuth = (): boolean => {
    if (!auth.loggedIn) {
      toast.info('请先登录 linux.do')
      void auth.showLogin()
      return false
    }
    return true
  }

  const markdownFor = (file: File, res: UploadResult): string => {
    const src = res.short_url ?? res.url
    const name = res.original_filename ?? file.name
    const isImage = file.type.startsWith('image/') || (!!res.width && !!res.height)
    if (isImage) {
      const dims = res.width && res.height ? `|${res.width}x${res.height}` : ''
      return `![${name}${dims}](${src})`
    }
    return `[${name}](${src})`
  }

  const uploadFiles = async (files: FileList | File[]): Promise<void> => {
    const list = Array.from(files)
    if (list.length === 0) return
    if (!guardAuth()) return
    const items = list.map((file) => ({ file, placeholder: `![上传中 ${file.name}…]()` }))
    insertAtCaret(items.map((i) => i.placeholder).join('\n'))
    setUploading((n) => n + items.length)
    await Promise.all(
      items.map(async ({ file, placeholder }) => {
        try {
          const res = await discourse.upload(file)
          if (res.short_url) uploadMap.current.set(res.short_url, absolutize(res.url))
          const md = markdownFor(file, res)
          setText((prev) => prev.replace(placeholder, () => md))
        } catch {
          toast.error('上传失败')
          setText((prev) => prev.replace(placeholder, () => ''))
        } finally {
          setUploading((n) => n - 1)
        }
      })
    )
  }

  const onFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const files = e.target.files
    if (files && files.length) void uploadFiles(files)
    e.target.value = ''
  }

  const pickImage = (): void => {
    if (!guardAuth()) return
    fileRef.current?.click()
  }

  const onDragOver = (e: DragEvent<HTMLTextAreaElement>): void => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
      setDragging(true)
    }
  }
  const onDragLeave = (): void => setDragging(false)
  const onDrop = (e: DragEvent<HTMLTextAreaElement>): void => {
    if (!e.dataTransfer.files.length) return
    e.preventDefault()
    setDragging(false)
    void uploadFiles(e.dataTransfer.files)
  }

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>): void => {
    const images = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) return
    e.preventDefault()
    void uploadFiles(images)
  }

  const toggleEmoji = (): void => {
    if (emojiOpen) {
      setEmojiOpen(false)
      return
    }
    const el = emojiBtnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setEmojiAnchor({
      left: Math.max(8, Math.min(r.left, window.innerWidth - 316)),
      top: r.bottom + 6
    })
    setEmojiOpen(true)
  }
  const pickEmoji = (char: string): void => {
    insertAtCaret(char)
    setEmojiOpen(false)
  }

  const isUploading = uploading > 0
  const canSubmit = text.trim().length > 0 && !submitting && !isUploading

  const onKeyDown = (ev: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (acRef.current?.onKeyDown(ev)) return
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter' && canSubmit) {
      ev.preventDefault()
      void onSubmit(text)
    }
  }

  const renderPreview = (): string => {
    let source = text
    uploadMap.current.forEach((real, short) => {
      source = source.split(short).join(real)
    })
    return DOMPurify.sanitize(marked.parse(source) as string)
  }

  return (
    <div className={styles.composer}>
      <div className={styles.tabsBar}>
        <Segmented
          options={[
            { value: 'write', label: '编辑' },
            { value: 'preview', label: '预览' }
          ]}
          value={tab}
          onChange={setTab}
          size="md"
          aria-label="编辑模式"
        />
      </div>

      {tab === 'write' && (
        <div className={styles.toolbar}>
          <div className={styles.group}>
            <IconButton label="粗体" type="button" onClick={() => wrap('**')}>
              <Bold size={16} />
            </IconButton>
            <IconButton label="斜体" type="button" onClick={() => wrap('*')}>
              <Italic size={16} />
            </IconButton>
            <IconButton label="删除线" type="button" onClick={() => wrap('~~')}>
              <Strikethrough size={16} />
            </IconButton>
          </div>
          <span className={styles.sep} />
          <div className={styles.group}>
            <IconButton label="标题" type="button" onClick={() => prefixLines('## ')}>
              <Heading size={16} />
            </IconButton>
            <IconButton label="引用" type="button" onClick={() => prefixLines('> ')}>
              <Quote size={16} />
            </IconButton>
          </div>
          <span className={styles.sep} />
          <div className={styles.group}>
            <IconButton label="行内代码" type="button" onClick={() => wrap('`')}>
              <Code size={16} />
            </IconButton>
            <IconButton label="代码块" type="button" onClick={() => wrap('```\n', '\n```')}>
              <SquareCode size={16} />
            </IconButton>
          </div>
          <span className={styles.sep} />
          <div className={styles.group}>
            <IconButton label="无序列表" type="button" onClick={() => prefixLines('- ')}>
              <List size={16} />
            </IconButton>
            <IconButton label="有序列表" type="button" onClick={() => prefixLines('1. ')}>
              <ListOrdered size={16} />
            </IconButton>
          </div>
          <span className={styles.sep} />
          <div className={styles.group}>
            <IconButton label="链接" type="button" onClick={() => wrap('[', '](url)')}>
              <Link2 size={16} />
            </IconButton>
            <IconButton label="上传图片 / 文件" type="button" onClick={pickImage}>
              <ImagePlus size={16} />
            </IconButton>
            <IconButton label="表格" type="button" onClick={insertTable}>
              <Table size={16} />
            </IconButton>
            <IconButton label="折叠内容" type="button" onClick={() => wrap('[spoiler]', '[/spoiler]')}>
              <EyeOff size={16} />
            </IconButton>
          </div>
          <span className={styles.sep} />
          <span ref={emojiBtnRef} className={styles.group}>
            <IconButton label="表情" type="button" active={emojiOpen} onClick={toggleEmoji}>
              <Smile size={16} />
            </IconButton>
          </span>
        </div>
      )}

      {tab === 'write' ? (
        <div className={styles.editArea}>
          <textarea
            ref={ref}
            className={`${styles.textarea} ${dragging ? styles.dragging : ''}`}
            style={{ minHeight }}
            value={text}
            placeholder={placeholder}
            autoFocus={autoFocus}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          />
          <InlineAutocomplete ref={acRef} textareaRef={ref} value={text} onReplace={replaceRange} />
        </div>
      ) : text.trim() ? (
        <div
          className={`${styles.preview} cooked`}
          style={{ minHeight }}
          dangerouslySetInnerHTML={{ __html: renderPreview() }}
        />
      ) : (
        <div className={`${styles.preview} ${styles.previewEmpty}`} style={{ minHeight }}>
          暂无内容
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf,.zip"
        multiple
        hidden
        onChange={onFileChange}
      />

      <div className={styles.actions}>
        <div className={styles.status}>
          <span className={styles.hint}>⌘↵ {submitLabel}</span>
          {isUploading && (
            <span className={styles.uploadChip}>
              <Loader2 size={13} className="spin" />
              上传中…
            </span>
          )}
        </div>
        <div className={styles.actionButtons}>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={submitting}>
              取消
            </Button>
          )}
          <Button
            variant="primary"
            loading={submitting}
            disabled={!canSubmit}
            onClick={() => void onSubmit(text)}
          >
            {submitLabel}
          </Button>
        </div>
      </div>

      {emojiOpen && (
        <EmojiPicker
          anchor={emojiAnchor}
          triggerRef={emojiBtnRef}
          onClose={() => {
            setEmojiOpen(false)
            ref.current?.focus()
          }}
          onPick={pickEmoji}
        />
      )}
    </div>
  )
}
