/** Client-side enhancement of Discourse `cooked` HTML that linux.do performs in
 *  the browser but that is missing from the raw server payload. */

interface AdmonitionMeta {
  label: string
  icon: string
}

/** GitHub/Obsidian callout types linux.do authors use, mapped to a localized
 *  label + a glyph. Per-type accent colors live in cooked.css. */
const ADMONITIONS: Record<string, AdmonitionMeta> = {
  success: { label: '成功', icon: '✓' },
  info: { label: '信息', icon: 'ℹ' },
  note: { label: '笔记', icon: '📝' },
  tip: { label: '提示', icon: '💡' },
  warning: { label: '警告', icon: '⚠' },
  danger: { label: '危险', icon: '✕' },
  question: { label: '疑问', icon: '❓' }
}

/** Detects a leading `[!type]` marker. */
const MARKER = /^\s*\[!(\w+)\]/i
/** Strips the marker (and any inline spaces after it) from the first line. */
const MARKER_STRIP = /^\s*\[!\w+\][ \t]*/i

/** First text node in document order whose value is not whitespace-only. */
function leadingText(container: Node): Text | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    if ((node.nodeValue ?? '').trim()) return node as Text
    node = walker.nextNode()
  }
  return null
}

/** Strips the `[!type]` marker from the block's first line, dropping a trailing
 *  `<br>` so the callout body starts cleanly. */
function stripMarker(lead: Text): void {
  lead.nodeValue = (lead.nodeValue ?? '').replace(MARKER_STRIP, '')
  if ((lead.nodeValue ?? '').trim()) return
  let sib = lead.nextSibling
  while (sib && sib.nodeType === Node.TEXT_NODE && !(sib.nodeValue ?? '').trim()) {
    const next = sib.nextSibling
    sib.remove()
    sib = next
  }
  if (sib && sib.nodeName === 'BR') sib.remove()
  if (!lead.nodeValue) lead.remove()
}

/** Builds an empty `.admonition` box and returns it with its content slot. */
function buildBox(type: string, meta: AdmonitionMeta): { box: HTMLElement; content: HTMLElement } {
  const box = document.createElement('div')
  box.className = `admonition admonition-${type}`
  const title = document.createElement('div')
  title.className = 'admonition-title'
  const icon = document.createElement('span')
  icon.className = 'admonition-icon'
  icon.setAttribute('aria-hidden', 'true')
  icon.textContent = meta.icon
  const label = document.createElement('span')
  label.textContent = meta.label
  title.append(icon, label)
  const content = document.createElement('div')
  content.className = 'admonition-content'
  box.append(title, content)
  return { box, content }
}

/** Converts GitHub/Obsidian callouts (`[!note]`, `[!warning]`, …) that arrive as
 *  raw text into styled `.admonition` blocks. Handles the blockquote form
 *  (`> [!NOTE]`) and a leading paragraph, case-insensitively, and is a no-op when
 *  no known marker is present. */
export function enhanceAdmonitions(root: HTMLElement): void {
  const candidates: HTMLElement[] = [
    ...root.querySelectorAll<HTMLElement>('blockquote'),
    ...root.querySelectorAll<HTMLElement>(':scope > p')
  ]
  for (const el of candidates) {
    if (el.closest('.admonition') || el.closest('aside')) continue
    const lead = leadingText(el)
    if (!lead) continue
    const match = (lead.nodeValue ?? '').match(MARKER)
    if (!match) continue
    const type = match[1].toLowerCase()
    const meta = ADMONITIONS[type]
    if (!meta) continue
    stripMarker(lead)
    const { box, content } = buildBox(type, meta)
    el.replaceWith(box)
    if (el.tagName === 'BLOCKQUOTE') {
      while (el.firstChild) content.appendChild(el.firstChild)
    } else {
      content.appendChild(el)
    }
  }
}
