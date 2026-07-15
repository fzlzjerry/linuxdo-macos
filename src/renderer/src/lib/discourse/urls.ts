export const LINUXDO_ORIGIN = 'https://linux.do'

/** Expand a Discourse avatar_template to a concrete URL at the given pixel size. */
export function avatarUrl(template: string | undefined, size = 48): string | null {
  if (!template) return null
  const path = template.replace('{size}', String(Math.round(size * 2))) // 2x for retina
  return path.startsWith('http') ? path : LINUXDO_ORIGIN + path
}

/** Absolutize a linux.do-relative URL found in cooked HTML. */
export function absolutize(url: string): string {
  if (!url) return url
  if (url.startsWith('//')) return 'https:' + url
  if (url.startsWith('/')) return LINUXDO_ORIGIN + url
  return url
}

export function topicUrl(id: number, slug?: string): string {
  return slug ? `${LINUXDO_ORIGIN}/t/${slug}/${id}` : `${LINUXDO_ORIGIN}/t/${id}`
}
