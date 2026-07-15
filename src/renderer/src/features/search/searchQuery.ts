// Discourse full-text search is driven by inline operators inside the `q` param
// (e.g. "vue #dev @alice tag:help status:solved order:latest"). The advanced
// panel collects these as structured state; buildSearchQuery composes the string.

export interface SearchFilters {
  order?: 'relevance' | 'latest' | 'likes' | 'views'
  /** A full operator token, e.g. 'status:solved' or 'in:bookmarks'. */
  status?: string
  categorySlug?: string
  user?: string
  tag?: string
  /** YYYY-MM-DD */
  after?: string
}

export function hasActiveFilters(f: SearchFilters): boolean {
  return !!(
    (f.order && f.order !== 'relevance') ||
    f.status ||
    f.categorySlug ||
    f.user?.trim() ||
    f.tag?.trim() ||
    f.after
  )
}

export function buildSearchQuery(text: string, f: SearchFilters): string {
  const parts: string[] = [text.trim()]
  if (f.categorySlug) parts.push(`#${f.categorySlug}`)
  if (f.user?.trim()) parts.push(`@${f.user.trim().replace(/^@/, '')}`)
  if (f.tag?.trim()) parts.push(`tag:${f.tag.trim().replace(/^#/, '')}`)
  if (f.status) parts.push(f.status)
  if (f.order && f.order !== 'relevance') parts.push(`order:${f.order}`)
  if (f.after) parts.push(`after:${f.after}`)
  return parts.filter(Boolean).join(' ').trim()
}
