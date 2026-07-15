import { formatDistanceToNowStrict, format } from 'date-fns'
import { zhCN } from 'date-fns/locale'

/** Relative time in Chinese, e.g. "3 小时前". Falls back gracefully on bad input. */
export function relativeTime(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return formatDistanceToNowStrict(d, { addSuffix: true, locale: zhCN })
}

export function absoluteTime(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return format(d, 'yyyy-MM-dd HH:mm')
}

/** Compact number, e.g. 1.2k, 34k. */
export function compactNumber(n: number | undefined): string {
  if (n == null) return '0'
  if (n < 1000) return String(n)
  if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  if (n < 1_000_000) return Math.round(n / 1000) + 'k'
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'm'
}
