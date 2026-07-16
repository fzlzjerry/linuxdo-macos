import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { TopicDetail, TopicListItem, TopicListResponse } from './types'

/** Fold a successful timings report into the local caches so unread pills
 *  clear immediately — without refetching (rate limits). Counts only ever
 *  shrink here; the server's next response is authoritative. */
export function applyLocalReadState(qc: QueryClient, topicId: number, maxRead: number): void {
  qc.setQueriesData<TopicDetail>({ queryKey: ['topic', topicId] }, (old) => {
    if (!old || (old.last_read_post_number ?? 0) >= maxRead) return old
    return { ...old, last_read_post_number: maxRead }
  })

  const patchList = (
    old: InfiniteData<TopicListResponse> | undefined
  ): InfiniteData<TopicListResponse> | undefined => {
    if (!old) return old
    let touched = false
    const pages = old.pages.map((page) => {
      const topics = page.topic_list?.topics
      if (!topics?.some((t) => t.id === topicId)) return page
      touched = true
      return {
        ...page,
        topic_list: {
          ...page.topic_list,
          topics: topics.map((t) => (t.id === topicId ? patchRow(t, maxRead) : t))
        }
      }
    })
    return touched ? { ...old, pages } : old
  }
  qc.setQueriesData<InfiniteData<TopicListResponse>>({ queryKey: ['topics'] }, patchList)
  qc.setQueriesData<InfiniteData<TopicListResponse>>({ queryKey: ['category-topics'] }, patchList)
}

function patchRow(t: TopicListItem, maxRead: number): TopicListItem {
  const read = Math.max(t.last_read_post_number ?? 0, maxRead)
  // Server counts exclude whispers/small actions, so highest - read may
  // overshoot — only ever lower the existing numbers, never raise them.
  const left = Math.max(0, (t.highest_post_number ?? 0) - read)
  return {
    ...t,
    last_read_post_number: read,
    unseen: false,
    unread: t.unread != null ? Math.min(t.unread, left) : t.unread,
    unread_posts: t.unread_posts != null ? Math.min(t.unread_posts, left) : t.unread_posts,
    new_posts: t.new_posts != null ? Math.min(t.new_posts, left) : t.new_posts
  }
}
