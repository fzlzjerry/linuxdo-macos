import type { DiscourseRequest } from '../../../../shared/api'
import type {
  BadgesResponse,
  BookmarksResponse,
  CategoryListResponse,
  DraftsResponse,
  EventsResponse,
  FlagType,
  GroupsResponse,
  LeaderboardResponse,
  ListingFilter,
  NotificationLevel,
  NotificationsResponse,
  Post,
  SearchResponse,
  SiteResponse,
  TopicDetail,
  TopicListResponse,
  TopPeriod,
  TypeaheadResponse,
  UserProfileResponse,
  UserSummaryResponse
} from './types'
import { LIKE_ACTION_ID } from './types'

export class DiscourseApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly needsAuth = false
  ) {
    super(message)
    this.name = 'DiscourseApiError'
  }
}

export interface UploadResult {
  id?: number
  url: string
  short_url?: string
  original_filename?: string
  width?: number
  height?: number
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (): void => {
      const res = String(reader.result)
      resolve(res.slice(res.indexOf(',') + 1))
    }
    reader.onerror = (): void => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

function ensureBridge(): void {
  if (typeof window === 'undefined' || !window.api) {
    throw new DiscourseApiError(
      '网络桥接不可用（请在 App 内运行，而非浏览器）。',
      0,
      false
    )
  }
}

/** Discourse returns `{ errors: [...] }` (or `{ error }`) on a failed write. Pull
 *  out the human message so callers surface the real reason, not a status code. */
function serverError(json: unknown): string | undefined {
  if (!json || typeof json !== 'object') return undefined
  const o = json as Record<string, unknown>
  if (Array.isArray(o.errors)) {
    const msgs = o.errors.filter((e): e is string => typeof e === 'string' && e.length > 0)
    if (msgs.length) return msgs.join('；')
  }
  return typeof o.error === 'string' && o.error ? o.error : undefined
}

async function request<T>(req: DiscourseRequest): Promise<T> {
  ensureBridge()
  const res = await window.api.discourse.request<T>(req)
  if (res.error) throw new DiscourseApiError(res.error, res.status, !!res.needsAuth)
  if (!res.ok) {
    throw new DiscourseApiError(
      serverError(res.json) ?? `请求失败 (${res.status})`,
      res.status,
      !!res.needsAuth || res.status === 401 || res.status === 403
    )
  }
  if (res.json === undefined) {
    throw new DiscourseApiError('响应不是有效的 JSON', res.status, !!res.needsAuth)
  }
  return res.json
}

function listingPath(filter: ListingFilter, page: number, period: TopPeriod): string {
  const p = `page=${page}`
  switch (filter) {
    case 'top':
      return `/top.json?period=${period}&${p}`
    case 'new':
      return `/new.json?${p}`
    case 'unread':
      return `/unread.json?${p}`
    case 'hot':
      return `/hot.json?${p}`
    case 'posted':
      return `/posted.json?${p}`
    case 'read':
      return `/read.json?${p}`
    case 'latest':
    default:
      return `/latest.json?${p}`
  }
}

export const discourse = {
  listing(filter: ListingFilter, page = 0, period: TopPeriod = 'weekly'): Promise<TopicListResponse> {
    return request<TopicListResponse>({ path: listingPath(filter, page, period) })
  },

  categoryTopics(
    slug: string,
    id: number,
    filter: ListingFilter = 'latest',
    page = 0
  ): Promise<TopicListResponse> {
    const base = filter === 'latest' ? `/c/${slug}/${id}.json` : `/c/${slug}/${id}/l/${filter}.json`
    return request<TopicListResponse>({ path: `${base}?page=${page}` })
  },

  /** Listing narrowed by category and/or tag (the site's 类别/标签 filters). */
  filteredListing(
    filter: ListingFilter,
    page: number,
    period: TopPeriod,
    category?: { slug: string; id: number },
    tag?: string
  ): Promise<TopicListResponse> {
    const l = filter === 'latest' ? '' : `/l/${filter}`
    let base: string
    if (category && tag) {
      base = `/tags/c/${category.slug}/${category.id}/${encodeURIComponent(tag)}${l}.json`
    } else if (category) {
      base = `/c/${category.slug}/${category.id}${l}.json`
    } else if (tag) {
      base = `/tag/${encodeURIComponent(tag)}${l}.json`
    } else {
      return request<TopicListResponse>({ path: listingPath(filter, page, period) })
    }
    let path = `${base}?page=${page}`
    if (filter === 'top') path += `&period=${period}`
    return request<TopicListResponse>({ path })
  },

  categories(): Promise<CategoryListResponse> {
    return request<CategoryListResponse>({
      path: '/categories.json?include_subcategories=true'
    })
  },

  topic(id: number, postNumber?: number): Promise<TopicDetail> {
    const path = postNumber ? `/t/${id}/${postNumber}.json` : `/t/${id}.json`
    return request<TopicDetail>({ path })
  },

  async postRaw(id: number): Promise<string> {
    const p = await request<Post>({ path: `/posts/${id}.json?include_raw=true` })
    return p.raw ?? ''
  },

  async postsBatch(topicId: number, ids: number[]): Promise<Post[]> {
    if (ids.length === 0) return []
    const q = ids.map((id) => `post_ids[]=${id}`).join('&')
    const res = await request<{ post_stream: { posts: Post[] } }>({
      path: `/t/${topicId}/posts.json?${q}`
    })
    return res.post_stream.posts
  },

  // ---- Writes (cookie session + CSRF handled in the engine) ----

  like(postId: number): Promise<unknown> {
    return request({
      path: '/post_actions.json',
      method: 'POST',
      form: true,
      body: { id: postId, post_action_type_id: LIKE_ACTION_ID, flag_topic: false }
    })
  },

  unlike(postId: number): Promise<unknown> {
    return request({
      path: `/post_actions/${postId}.json?post_action_type_id=${LIKE_ACTION_ID}`,
      method: 'DELETE'
    })
  },

  /** The site's flaggable post-action types (labels/ids/require_message live on
      the server; linux.do adds custom flags, so this must not be hard-coded). */
  async flagTypes(): Promise<FlagType[]> {
    const site = await request<SiteResponse>({ path: '/site.json' })
    return (site.post_action_types ?? [])
      .filter((p) => p.is_flag && p.name_key !== 'notify_user')
      .map((p) => ({
        id: p.id,
        name_key: p.name_key,
        name: p.name ?? p.name_key,
        description: p.description,
        require_message: p.require_message
      }))
  },

  /** Flag a post with one of the site's flag type ids (see flagTypes()). */
  flagPost(postId: number, postActionTypeId: number, message?: string): Promise<unknown> {
    return request({
      path: '/post_actions.json',
      method: 'POST',
      form: true,
      body: {
        id: postId,
        post_action_type_id: postActionTypeId,
        flag_topic: false,
        ...(message ? { message } : {})
      }
    })
  },

  // discourse-solved: mark/unmark a reply as the topic's accepted answer.
  acceptSolution(postId: number): Promise<unknown> {
    return request({ path: '/solution/accept', method: 'POST', form: true, body: { id: postId } })
  },

  unacceptSolution(postId: number): Promise<unknown> {
    return request({ path: '/solution/unaccept', method: 'POST', form: true, body: { id: postId } })
  },

  toggleReaction(postId: number, reactionId: string): Promise<unknown> {
    return request({
      path: `/discourse-reactions/posts/${postId}/custom-reactions/${reactionId}/toggle.json`,
      method: 'PUT'
    })
  },

  async upload(file: File): Promise<UploadResult> {
    const base64 = await fileToBase64(file)
    return request<UploadResult>({
      path: '/uploads.json',
      method: 'POST',
      upload: {
        base64,
        filename: file.name || 'upload',
        mime: file.type || 'application/octet-stream',
        type: 'composer'
      }
    })
  },

  searchUsers(term: string): Promise<{ users?: { username: string; name?: string; avatar_template?: string }[] }> {
    return request({
      path: `/u/search/users.json?term=${encodeURIComponent(term)}&include_groups=false&limit=6`
    })
  },

  /** Per-tag icon lookup via the hashtag API (linux.do assigns FA icons to
      some tags). Returns tag name → icon name; parsed defensively since the
      response is keyed by hashtag type. */
  async tagIcons(tags: string[]): Promise<Record<string, string>> {
    if (tags.length === 0) return {}
    const qs = tags.map((t) => `slugs[]=${encodeURIComponent(`${t}::tag`)}`).join('&')
    const raw = await request<Record<string, unknown>>({ path: `/hashtags.json?${qs}` })
    const out: Record<string, string> = {}
    for (const bucket of Object.values(raw ?? {})) {
      if (!Array.isArray(bucket)) continue
      for (const h of bucket as Array<Record<string, unknown>>) {
        if (h?.type === 'category') continue
        const slug = typeof h?.slug === 'string' ? h.slug : undefined
        const ref = typeof h?.ref === 'string' ? h.ref.replace(/::tag$/, '') : undefined
        const icon = typeof h?.icon === 'string' ? h.icon : undefined
        const key = slug ?? ref
        if (key && icon) out[key] = icon
      }
    }
    return out
  },

  /** Existing-tag lookup (same endpoint the Discourse composer uses).
      Empty q returns the most-used tags, sorted by topic count.
      NOTE: limit is server-capped by max_tag_search_results (default 5) —
      anything above it fails the request contract with a 400. */
  searchTags(q: string, limit = 5): Promise<{ name: string; count: number }[]> {
    const capped = Math.min(limit, 5)
    return request<{
      results?: { id?: string | number; name?: string; text?: string; count?: number }[]
    }>({
      path: `/tags/filter/search.json?q=${encodeURIComponent(q)}&limit=${capped}`
    }).then((r) =>
      (r.results ?? [])
        .map((t) => ({ name: String(t.name ?? t.text ?? t.id ?? ''), count: t.count ?? 0 }))
        .filter((t) => t.name)
    )
  },

  // discourse-boosts plugin. Routes are namespaced under /discourse-boosts/; the
  // frontend posts { raw } to /posts/:id/boosts (post id lives in the URL path).
  createBoost(postId: number, raw: string): Promise<unknown> {
    return request({
      path: `/discourse-boosts/posts/${postId}/boosts.json`,
      method: 'POST',
      form: true,
      body: { raw }
    })
  },

  deleteBoost(boostId: number): Promise<unknown> {
    return request({ path: `/discourse-boosts/boosts/${boostId}.json`, method: 'DELETE' })
  },

  reply(params: { topicId: number; raw: string; replyToPostNumber?: number }): Promise<Post> {
    return request<Post>({
      path: '/posts.json',
      method: 'POST',
      form: true,
      body: {
        topic_id: params.topicId,
        raw: params.raw,
        ...(params.replyToPostNumber ? { reply_to_post_number: params.replyToPostNumber } : {})
      }
    })
  },

  bookmark(id: number, type: 'Post' | 'Topic' = 'Post'): Promise<{ id: number }> {
    return request<{ id: number }>({
      path: '/bookmarks.json',
      method: 'POST',
      form: true,
      body: { bookmarkable_id: id, bookmarkable_type: type }
    })
  },

  unbookmark(bookmarkId: number): Promise<unknown> {
    return request({ path: `/bookmarks/${bookmarkId}.json`, method: 'DELETE' })
  },

  editPost(id: number, raw: string, editReason?: string): Promise<Post> {
    return request<Post>({
      path: `/posts/${id}.json`,
      method: 'PUT',
      form: true,
      body: { 'post[raw]': raw, 'post[edit_reason]': editReason }
    })
  },

  deletePost(id: number): Promise<unknown> {
    return request({ path: `/posts/${id}.json`, method: 'DELETE' })
  },

  createTopic(params: {
    title: string
    raw: string
    category?: number
    tags?: string[]
  }): Promise<Post> {
    return request<Post>({
      path: '/posts.json',
      method: 'POST',
      form: true,
      body: {
        title: params.title,
        raw: params.raw,
        category: params.category,
        'tags[]': params.tags,
        archetype: 'regular'
      }
    })
  },

  createMessage(params: { title: string; raw: string; recipients: string }): Promise<Post> {
    return request<Post>({
      path: '/posts.json',
      method: 'POST',
      form: true,
      body: {
        title: params.title,
        raw: params.raw,
        archetype: 'private_message',
        target_recipients: params.recipients
      }
    })
  },

  setTopicNotificationLevel(topicId: number, level: NotificationLevel): Promise<unknown> {
    return request({
      path: `/t/${topicId}/notifications`,
      method: 'POST',
      form: true,
      body: { notification_level: level }
    })
  },

  /** "消除新" — mark every topic in the New list as seen. */
  dismissNew(): Promise<unknown> {
    return request({ path: '/topics/reset-new.json', method: 'PUT' })
  },

  /** "消除未读" — dismiss unread posts for the given tracked topics. */
  dismissUnread(topicIds: number[]): Promise<unknown> {
    return request({
      path: '/topics/bulk.json',
      method: 'PUT',
      form: true,
      body: { 'topic_ids[]': topicIds, 'operation[type]': 'dismiss_posts' }
    })
  },

  notifications(recent = false, offset = 0): Promise<NotificationsResponse> {
    const q = new URLSearchParams({ limit: '30' })
    if (recent) q.set('recent', 'true')
    if (offset) q.set('offset', String(offset))
    return request<NotificationsResponse>({ path: `/notifications.json?${q.toString()}` })
  },

  markNotificationsRead(id?: number): Promise<unknown> {
    return request({
      path: '/notifications/mark-read',
      method: 'PUT',
      form: true,
      body: id ? { id } : {}
    })
  },

  search(term: string, page = 1): Promise<SearchResponse> {
    return request<SearchResponse>({
      path: `/search.json?q=${encodeURIComponent(term)}&page=${page}`
    })
  },

  searchTypeahead(term: string): Promise<TypeaheadResponse> {
    return request<TypeaheadResponse>({
      path: `/search/query.json?term=${encodeURIComponent(term)}&include_blurbs=true`
    })
  },

  user(username: string): Promise<UserProfileResponse> {
    return request<UserProfileResponse>({ path: `/u/${encodeURIComponent(username)}.json` })
  },

  userSummary(username: string): Promise<UserSummaryResponse> {
    return request<UserSummaryResponse>({
      path: `/u/${encodeURIComponent(username)}/summary.json`
    })
  },

  userBookmarks(username: string): Promise<BookmarksResponse> {
    return request<BookmarksResponse>({
      path: `/u/${encodeURIComponent(username)}/bookmarks.json`
    })
  },

  privateMessages(username: string): Promise<TopicListResponse> {
    return request<TopicListResponse>({
      path: `/topics/private-messages/${encodeURIComponent(username)}.json`
    })
  },

  drafts(): Promise<DraftsResponse> {
    return request<DraftsResponse>({ path: '/drafts.json' })
  },

  // discourse-gamification: the default leaderboard id is 1 ("全局排行榜").
  leaderboard(id = 1, period?: string): Promise<LeaderboardResponse> {
    const q = period ? `?period=${encodeURIComponent(period)}` : ''
    return request<LeaderboardResponse>({ path: `/leaderboard/${id}.json${q}` })
  },

  // discourse-calendar: upcoming post-events across the forum.
  events(): Promise<EventsResponse> {
    return request<EventsResponse>({ path: '/discourse-post-event/events.json' })
  },

  badges(): Promise<BadgesResponse> {
    return request<BadgesResponse>({ path: '/badges.json' })
  },

  groups(): Promise<GroupsResponse> {
    return request<GroupsResponse>({ path: '/groups.json' })
  },

  deleteDraft(key: string, sequence: number): Promise<unknown> {
    return request({
      path: `/drafts/${encodeURIComponent(key)}.json`,
      method: 'DELETE',
      form: true,
      body: { sequence }
    })
  }
}

/** Next page index for infinite lists: undefined when there is no more. */
export function nextPage(res: TopicListResponse, current: number): number | undefined {
  return res.topic_list.more_topics_url ? current + 1 : undefined
}
