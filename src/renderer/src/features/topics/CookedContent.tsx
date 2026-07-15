import { useEffect, useMemo, useRef, type MouseEvent } from 'react'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/common'
import { useNavigate } from 'react-router-dom'
import { absolutize } from '../../lib/discourse/urls'
import { useLightbox } from '../../store/lightbox'
import { enhanceAdmonitions } from './enhanceCooked'

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'controls', 'colspan', 'rowspan'],
    ADD_TAGS: ['video', 'audio', 'source', 'details', 'summary'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'input', 'button']
  })
}

const TOPIC_LINK = /^https?:\/\/linux\.do\/t\/(?:[^/]+\/)?(\d+)/i
const USER_LINK = /^https?:\/\/linux\.do\/u\/([^/?#]+)/i

/** Renders Discourse `cooked` HTML: sanitized, absolutized, syntax-highlighted,
 *  with in-app routing for linux.do topic links and external links opened natively. */
export function CookedContent({ html }: { html: string }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const clean = useMemo(() => sanitize(html), [html])

  useEffect(() => {
    const root = ref.current
    if (!root) return
    enhanceAdmonitions(root)
    root.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src')
      if (src) img.setAttribute('src', absolutize(src))
      img.setAttribute('loading', 'lazy')
      img.removeAttribute('srcset')
    })
    root.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href')
      if (href) a.setAttribute('href', absolutize(href))
    })
    root.querySelectorAll('pre code').forEach((el) => {
      try {
        hljs.highlightElement(el as HTMLElement)
      } catch {
        /* highlight is best-effort */
      }
    })
  }, [clean])

  const onClick = (e: MouseEvent<HTMLDivElement>): void => {
    const target = e.target as HTMLElement

    // Images open in the in-app lightbox (before any anchor handling —
    // Discourse wraps large images in <a class="lightbox" href="full-size">).
    const img = target.closest('img')
    if (img && !img.classList.contains('emoji') && !img.classList.contains('avatar')) {
      e.preventDefault()
      const a = img.closest('a')
      const full =
        a?.classList.contains('lightbox') && a.getAttribute('href')
          ? absolutize(a.getAttribute('href') as string)
          : img.currentSrc || img.src
      const filename =
        a?.querySelector('.meta .filename')?.textContent?.trim() || img.alt || undefined
      useLightbox.getState().open({ src: full, alt: img.alt, filename })
      return
    }

    const anchor = target.closest('a')
    if (!anchor) return
    const href = anchor.getAttribute('href')
    if (!href) return
    const topic = href.match(TOPIC_LINK)
    const user = href.match(USER_LINK)
    if (topic) {
      e.preventDefault()
      navigate(`/t/${topic[1]}`)
    } else if (user) {
      // @mentions and profile links open the in-app profile page.
      e.preventDefault()
      navigate(`/u/${decodeURIComponent(user[1])}`)
    } else if (/^https?:/i.test(href)) {
      e.preventDefault()
      void window.api?.openExternal(href)
    }
  }

  return (
    <div
      ref={ref}
      className="cooked"
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  )
}
