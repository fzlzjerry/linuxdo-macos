import { useEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent } from 'react'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/common'
import { useNavigate } from 'react-router-dom'
import { absolutize } from '../../lib/discourse/urls'
import { useLightbox, type LightboxImage } from '../../store/lightbox'
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

/** Emoji and avatars stay inline; everything else opens the lightbox. */
function isLightboxable(img: HTMLImageElement): boolean {
  return !img.classList.contains('emoji') && !img.classList.contains('avatar')
}

function toLightboxImage(img: HTMLImageElement): LightboxImage {
  // Discourse wraps large images in <a class="lightbox" href="full-size">.
  const a = img.closest('a')
  const src =
    a?.classList.contains('lightbox') && a.getAttribute('href')
      ? absolutize(a.getAttribute('href') as string)
      : img.currentSrc || img.src
  const filename =
    a?.querySelector('.meta .filename')?.textContent?.trim() || img.alt || undefined
  return { src, alt: img.alt || undefined, filename }
}

/** Open the clicked image as part of a gallery of every lightboxable image
    in the same .cooked container. */
function openFromCooked(img: HTMLImageElement, root: HTMLElement): void {
  const imgs = Array.from(root.querySelectorAll('img')).filter(isLightboxable)
  const index = Math.max(imgs.indexOf(img), 0)
  useLightbox.getState().open(imgs.map(toLightboxImage), index)
}

/** Renders Discourse `cooked` HTML: sanitized, absolutized, syntax-highlighted,
 *  with in-app routing for linux.do topic links and external links opened natively.
 *  `hidePolls` removes the static `.poll` markup so an interactive PollView can
 *  render it from structured data instead. */
export function CookedContent({
  html,
  hidePolls
}: {
  html: string
  hidePolls?: boolean
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const clean = useMemo(() => sanitize(html), [html])

  useEffect(() => {
    const root = ref.current
    if (!root) return
    if (hidePolls) root.querySelectorAll('.poll').forEach((el) => el.remove())
    enhanceAdmonitions(root)
    root.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src')
      if (src) img.setAttribute('src', absolutize(src))
      img.setAttribute('loading', 'lazy')
      img.removeAttribute('srcset')
      if (isLightboxable(img)) {
        // Keyboard-reachable: Enter/Space on the delegated onKeyDown below.
        img.tabIndex = 0
        img.setAttribute('role', 'button')
        img.setAttribute('aria-label', '查看图片')
      }
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
  }, [clean, hidePolls])

  const onClick = (e: MouseEvent<HTMLDivElement>): void => {
    const target = e.target as HTMLElement

    // Images open in the in-app lightbox (before any anchor handling —
    // Discourse wraps large images in <a class="lightbox" href="full-size">).
    const img = target.closest('img')
    if (img && isLightboxable(img)) {
      e.preventDefault()
      openFromCooked(img, e.currentTarget)
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

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const img = (e.target as HTMLElement).closest('img')
    if (img && isLightboxable(img)) {
      e.preventDefault()
      openFromCooked(img, e.currentTarget)
    }
  }

  return (
    <div
      ref={ref}
      className="cooked"
      onClick={onClick}
      onKeyDown={onKeyDown}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  )
}
