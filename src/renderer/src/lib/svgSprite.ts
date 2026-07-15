import { useSyncExternalStore } from 'react'
import DOMPurify from 'dompurify'

/** Injects linux.do's svg icon sprite (pulled from the engine webview) into
    the app document so `<use href="#icon">` — in cooked HTML and our own
    SpriteIcon — resolves. */

let state: 'idle' | 'loading' | 'ready' = 'idle'
const subs = new Set<() => void>()

function emit(): void {
  subs.forEach((f) => f())
}

export function useSpriteReady(): boolean {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => state === 'ready'
  )
}

export async function ensureSvgSprite(): Promise<void> {
  if (state !== 'idle') return
  state = 'loading'
  for (let i = 0; i < 8; i++) {
    try {
      const html = await window.api?.svgSprite?.()
      if (html && html.includes('<symbol')) {
        const clean = DOMPurify.sanitize(html, { USE_PROFILES: { svg: true, svgFilters: true } })
        const host = document.createElement('div')
        host.id = 'svg-sprites'
        host.setAttribute('aria-hidden', 'true')
        host.style.position = 'absolute'
        host.style.width = '0'
        host.style.height = '0'
        host.style.overflow = 'hidden'
        host.innerHTML = clean
        document.body.appendChild(host)
        state = 'ready'
        emit()
        return
      }
    } catch {
      /* engine may still be booting — retry below */
    }
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)))
  }
  state = 'idle' // give a later manual retry a chance
}
