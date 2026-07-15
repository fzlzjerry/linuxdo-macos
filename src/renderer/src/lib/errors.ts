import { DiscourseApiError } from './discourse/client'

/** Map a mutation failure to actionable Chinese copy (network / rate-limit /
    auth / server message), instead of a generic 操作失败. */
export function errorMessage(e: unknown, fallback = '操作失败'): string {
  if (e instanceof DiscourseApiError) {
    if (e.status === 0) return '网络连接失败，请检查网络后重试'
    if (e.status === 429) return '操作太频繁，请稍候再试'
    if (e.needsAuth || e.status === 401 || e.status === 403) return '需要登录或没有权限'
    if (e.message) return e.message
    return fallback
  }
  return e instanceof Error && e.message ? e.message : fallback
}
