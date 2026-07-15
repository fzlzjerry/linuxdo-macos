// The structured `post.polls` field carries vote counts but NOT the poll title
// or option text — those live in the cooked `.poll` markup. Parse the cooked
// HTML so we can render an interactive poll in place of the static one.

export interface ParsedPollOption {
  id: string
  text: string
}
export interface ParsedPoll {
  name: string
  type: string
  status: string
  results: string
  public: boolean
  min?: number
  max?: number
  title?: string
  options: ParsedPollOption[]
}

function numAttr(el: Element, attr: string): number | undefined {
  const v = el.getAttribute(attr)
  const n = v == null ? NaN : Number(v)
  return Number.isFinite(n) ? n : undefined
}

export function parsePolls(html: string): ParsedPoll[] {
  if (!html || !html.includes('class="poll"')) return []
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(html, 'text/html')
  } catch {
    return []
  }
  const out: ParsedPoll[] = []
  doc.querySelectorAll('.poll').forEach((el) => {
    const options = Array.from(el.querySelectorAll('li[data-poll-option-id]'))
      .map((li) => ({
        id: li.getAttribute('data-poll-option-id') ?? '',
        text: (li.textContent ?? '').trim()
      }))
      .filter((o) => o.id)
    if (options.length === 0) return
    out.push({
      name: el.getAttribute('data-poll-name') || 'poll',
      type: el.getAttribute('data-poll-type') || 'regular',
      status: el.getAttribute('data-poll-status') || 'open',
      results: el.getAttribute('data-poll-results') || 'always',
      public: el.getAttribute('data-poll-public') === 'true',
      min: numAttr(el, 'data-poll-min'),
      max: numAttr(el, 'data-poll-max'),
      title: el.querySelector('.poll-title')?.textContent?.trim() || undefined,
      options
    })
  })
  return out
}
