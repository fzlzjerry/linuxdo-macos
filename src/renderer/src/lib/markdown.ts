import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ gfm: true, breaks: true })

// Discourse linkifies bare domains (moraxcheng.me) when the TLD is in the
// markdown_linkify_tlds site setting; GFM only autolinks http(s)/www forms.
// Mirror the site's list so the preview matches the published result.
let linkifyTlds: Set<string> | null = null
let tldsInflight = false
function ensureTlds(): void {
  if (linkifyTlds || tldsInflight || !window.api?.siteSetting) return
  tldsInflight = true
  window.api
    .siteSetting('markdown_linkify_tlds')
    .then((raw) => {
      linkifyTlds = new Set(
        (raw || 'com|net|org')
          .split('|')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      )
    })
    .catch(() => {
      tldsInflight = false // retry on a later render
    })
}

const BARE_DOMAIN =
  /(^|[\s(（【《>])((?:[a-z0-9][a-z0-9-]*\.)+([a-z]{2,}))((?::\d{2,5})?(?:[/?][^\s<>）】》)]*)?)/gi

/** Wrap bare domains (TLD-gated) in anchors, skipping a/code/pre subtrees. */
function linkifyBareDomains(root: HTMLElement): void {
  const tlds = linkifyTlds
  if (!tlds) return
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest('a, code, pre')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT
  })
  const texts: Text[] = []
  while (walker.nextNode()) texts.push(walker.currentNode as Text)
  for (const text of texts) {
    const value = text.nodeValue ?? ''
    BARE_DOMAIN.lastIndex = 0
    if (!BARE_DOMAIN.test(value)) continue
    BARE_DOMAIN.lastIndex = 0
    const frag = document.createDocumentFragment()
    let last = 0
    let m: RegExpExecArray | null
    while ((m = BARE_DOMAIN.exec(value)) !== null) {
      const [, lead, domain, tld, tail] = m
      const start = m.index + lead.length
      // Sentence punctuation belongs to the prose, not the URL (linkify-it
      // behaves the same server-side).
      const full = (domain + (tail ?? '')).replace(/[.,;:!?、。，；：！？'"’”]+$/, '')
      const after = value[start + full.length]
      // john.me@gmail.com must stay an email — never split the local part.
      if (after === '@' || !tlds.has(tld.toLowerCase())) continue
      frag.append(value.slice(last, start))
      const a = document.createElement('a')
      a.href = `http://${full}`
      a.textContent = full
      frag.append(a)
      last = start + full.length
    }
    if (last === 0) continue
    frag.append(value.slice(last))
    text.replaceWith(frag)
  }
}

/** Local markdown → sanitized HTML. Used for the composer preview and for
    optimistic (pending) posts before the server-cooked version arrives.
    `uploadMap` rewrites upload:// short urls to absolute ones. */
export function renderMarkdown(raw: string, uploadMap?: Map<string, string>): string {
  ensureTlds()
  let source = raw
  uploadMap?.forEach((real, short) => {
    source = source.split(short).join(real)
  })
  const clean = DOMPurify.sanitize(marked.parse(source) as string)
  if (!linkifyTlds) return clean
  const doc = new DOMParser().parseFromString(clean, 'text/html')
  linkifyBareDomains(doc.body)
  return doc.body.innerHTML
}
