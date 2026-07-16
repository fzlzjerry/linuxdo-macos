/** Lightweight fuzzy matcher for the ⌘K palette. No dependencies.
 *
 * Scoring tiers (higher = better, 0 = no match):
 *   100..85  whole query is a prefix of the text
 *      70    query starts at a word boundary
 *   50..35   contiguous substring elsewhere
 *   30..1    scattered subsequence (each skipped char costs 2)
 *
 * CJK titles (the palette's recent topics) are matched by the caller with
 * plain `includes` — subsequence matching over CJK produces junk hits.
 */
export function fuzzyScore(query: string, text: string, keywords?: string[]): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  let best = scoreOne(q, text.toLowerCase())
  if (keywords) {
    for (const k of keywords) best = Math.max(best, scoreOne(q, k.toLowerCase()))
  }
  return best
}

function scoreOne(q: string, t: string): number {
  if (!t || q.length > t.length) return 0
  if (t.startsWith(q)) return 100 - Math.min(15, t.length - q.length)
  const at = t.indexOf(q)
  if (at > 0) {
    const prev = t[at - 1]
    if (prev === ' ' || prev === '-' || prev === '_' || prev === '.') return 70
    return 50 - Math.min(15, at)
  }
  // Scattered subsequence: every char must appear in order; gaps between
  // consecutive hits are penalised so tighter matches rank higher.
  let gaps = 0
  let pos = -1
  for (let i = 0; i < q.length; i++) {
    const found = t.indexOf(q[i], pos + 1)
    if (found === -1) return 0
    if (pos !== -1) gaps += found - pos - 1
    pos = found
  }
  return Math.max(1, 30 - gaps * 2)
}
