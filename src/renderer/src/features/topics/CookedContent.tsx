import { useEffect, useMemo, useRef, type MouseEvent } from 'react'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/common'
import { useNavigate } from 'react-router-dom'
import { absolutize } from '../../lib/discourse/urls'

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'controls', 'colspan', 'rowspan'],
    ADD_TAGS: ['video', 'audio', 'source', 'details', 'summary'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'input', 'button']
  })
}

const TOPIC_LINK = /^https?:\/\/linux\.do\/t\/(?:[^/]+\/)?(\d+)/i

/** Renders Discourse `cooked` HTML: sanitized, absolutized, syntax-highlighted,
 *  with in-app routing for linux.do topic links and external links opened natively. */
export function CookedContent({ html }: { html: string }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const clean = useMemo(() => sanitize(html), [html])

  useEffect(() => {
    const root = ref.current
    if (!root) return
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
    const anchor = (e.target as HTMLElement).closest('a')
    if (!anchor) return
    const href = anchor.getAttribute('href')
    if (!href) return
    const topic = href.match(TOPIC_LINK)
    if (topic) {
      e.preventDefault()
      navigate(`/t/${topic[1]}`)
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
