import { useEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent } from 'react'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/common'
import { useNavigate } from 'react-router-dom'
import { absolutize } from '../../lib/discourse/urls'
import { useLightbox, type LightboxImage } from '../../store/lightbox'
import { useCategoryMap } from '../../lib/discourse/CategoriesContext'
import { useTagIcons } from '../../lib/tagIcons'
import { useSpriteReady } from '../../lib/svgSprite'
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

const SVG_NS = 'http://www.w3.org/2000/svg'

function spriteSvg(icon: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('aria-hidden', 'true')
  svg.style.fill = 'currentColor'
  const use = document.createElementNS(SVG_NS, 'use')
  use.setAttribute('href', `#${icon}`)
  svg.appendChild(use)
  return svg
}

/** Renders Discourse `cooked` HTML: sanitized, absolutized, syntax-highlighted,
 *  with in-app routing for linux.do topic links and external links opened natively.
 *  `hidePolls` removes the static `.poll` markup so an interactive PollView can
 *  render it from structured data instead. */
export function CookedContent({
  html,
  hidePolls,
  topicId,
  onJumpToPost
}: {
  html: string
  hidePolls?: boolean
  /** Current topic id — same-topic quote jumps stay in place. */
  topicId?: number
  /** Scroll-to-floor handler supplied by TopicPage. */
  onJumpToPost?: (postNumber: number) => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const clean = useMemo(() => sanitize(html), [html])

  // Hashtag pills (#tag / #category) arrive with a bare square placeholder —
  // the website's JS swaps in the real icon at render time, so we must too.
  const hashtagSlugs = useMemo(() => {
    if (!clean.includes('hashtag-cooked')) return []
    const doc = new DOMParser().parseFromString(clean, 'text/html')
    const slugs: string[] = []
    doc.querySelectorAll('a.hashtag-cooked[data-type="tag"][data-slug]').forEach((a) => {
      const slug = a.getAttribute('data-slug')
      if (slug) slugs.push(slug)
    })
    return slugs
  }, [clean])
  const tagIcons = useTagIcons(hashtagSlugs)
  const categories = useCategoryMap()
  const spriteReady = useSpriteReady()

  // useTagIcons returns a fresh object every render (and the reader re-renders
  // on scroll), so the effect keys on a stable signature — otherwise every
  // scroll tick would tear down and rebuild the icon DOM.
  const tagIconsRef = useRef(tagIcons)
  tagIconsRef.current = tagIcons
  const iconsKey = hashtagSlugs.map((s) => `${s}:${tagIcons[s] ?? ''}`).join('|')

  useEffect(() => {
    const root = ref.current
    if (!root) return
    root.querySelectorAll<HTMLAnchorElement>('a.hashtag-cooked').forEach((a) => {
      const slot = a.querySelector('.hashtag-icon-placeholder')
      if (!slot) return
      const type = a.getAttribute('data-type')
      if (type === 'category') {
        const cat = categories.get(Number(a.getAttribute('data-id')))
        if (!cat?.color) return
        const square = document.createElement('span')
        square.className = 'hashtag-category-square'
        square.style.background = `#${cat.color}`
        slot.replaceChildren(square)
      } else if (type === 'tag' && spriteReady) {
        const slug = a.getAttribute('data-slug') ?? ''
        slot.replaceChildren(spriteSvg(tagIconsRef.current[slug] || 'tag'))
      }
    })
  }, [clean, iconsKey, categories, spriteReady])

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
        // The accessible name must keep the image's own alt — a bare
        // "查看图片" would strip every description from screen readers.
        img.tabIndex = 0
        img.setAttribute('role', 'button')
        const alt = img.getAttribute('alt')?.trim()
        img.setAttribute('aria-label', alt ? `查看图片：${alt}` : '查看图片')
        // Discourse wraps large images in <a class="lightbox">: drop that
        // anchor from the tab order, or the same picture gets two stops and
        // Enter on the first one bounces out to the external browser.
        const wrapper = img.closest('a.lightbox')
        if (wrapper instanceof HTMLElement) wrapper.tabIndex = -1
      }
    })
    root.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href')
      if (href) a.setAttribute('href', absolutize(href))
    })
    // Quote headers become jump affordances (web parity: expand/goto controls
    // are stripped by CSS; the title itself carries the navigation instead).
    root.querySelectorAll('aside.quote[data-topic]').forEach((q) => {
      const title = q.querySelector(':scope > .title')
      if (title instanceof HTMLElement) {
        title.tabIndex = 0
        title.setAttribute('role', 'link')
        title.setAttribute('aria-label', '查看被引用的帖子')
      }
    })
    root.querySelectorAll('pre code').forEach((el) => {
      try {
        hljs.highlightElement(el as HTMLElement)
      } catch {
        /* highlight is best-effort */
      }
    })
  }, [clean, hidePolls])

  /** Quote-title navigation shared by click and keyboard activation. */
  const jumpFromQuote = (title: Element): boolean => {
    const aside = title.closest('aside.quote')
    if (!aside) return false
    const qTopic = Number(aside.getAttribute('data-topic'))
    if (!qTopic) return false
    const qPost = Number(aside.getAttribute('data-post')) || 1
    if (onJumpToPost && topicId && qTopic === topicId) onJumpToPost(qPost)
    else navigate(`/t/${qTopic}${qPost > 1 ? `?post=${qPost}` : ''}`)
    return true
  }

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

    const quoteTitle = target.closest('aside.quote > .title')
    if (quoteTitle && jumpFromQuote(quoteTitle)) {
      e.preventDefault()
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
    const target = e.target as HTMLElement
    const img = target.closest('img')
    if (img && isLightboxable(img)) {
      e.preventDefault()
      openFromCooked(img, e.currentTarget)
      return
    }
    const quoteTitle = target.closest('aside.quote > .title')
    if (quoteTitle && jumpFromQuote(quoteTitle)) e.preventDefault()
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
