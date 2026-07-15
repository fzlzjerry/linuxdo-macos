import type { DiscourseRequest } from '../../../../shared/api'
import type {
  BookmarksResponse,
  CategoryListResponse,
  DraftsResponse,
  ListingFilter,
  NotificationLevel,
  NotificationsResponse,
  Post,
  SearchResponse,
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

function ensureBridge(): void {
  if (typeof window === 'undefined' || !window.api) {
    throw new DiscourseApiError(
      '网络桥接不可用（请在 App 内运行，而非浏览器）。',
      0,
      false
    )
  }
}

async function request<T>(req: DiscourseRequest): Promise<T> {
  ensureBridge()
  const res = await window.api.discourse.request<T>(req)
  if (res.error) throw new DiscourseApiError(res.error, res.status, !!res.needsAuth)
  if (!res.ok) {
    throw new DiscourseApiError(
      `请求失败 (${res.status})`,
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

  toggleReaction(postId: number, reactionId: string): Promise<unknown> {
    return request({
      path: `/discourse-reactions/posts/${postId}/custom-reactions/${reactionId}/toggle.json`,
      method: 'PUT'
    })
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
