import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { discourse, nextPage } from './client'
import type {
  DiscourseUser,
  ListingFilter,
  TopicListResponse,
  TopPeriod
} from './types'

export function useTopicList(
  filter: ListingFilter,
  period: TopPeriod = 'weekly',
  category?: { slug: string; id: number },
  tag?: string
) {
  return useInfiniteQuery({
    queryKey: [
      'topics',
      filter,
      filter === 'top' ? period : null,
      category?.id ?? null,
      tag ?? null
    ],
    queryFn: ({ pageParam }) =>
      category || tag
        ? discourse.filteredListing(filter, pageParam, period, category, tag)
        : discourse.listing(filter, pageParam, period),
    initialPageParam: 0,
    getNextPageParam: (lastPage: TopicListResponse, allPages) =>
      nextPage(lastPage, allPages.length - 1),
    staleTime: 30_000
  })
}

export function useCategoryTopics(slug: string, id: number, filter: ListingFilter = 'latest') {
  return useInfiniteQuery({
    queryKey: ['category-topics', id, filter],
    queryFn: ({ pageParam }) => discourse.categoryTopics(slug, id, filter, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage: TopicListResponse, allPages) =>
      nextPage(lastPage, allPages.length - 1),
    staleTime: 30_000,
    enabled: id > 0
  })
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => discourse.categories(),
    staleTime: 5 * 60_000
  })
}

export function useTopic(id: number) {
  return useQuery({
    queryKey: ['topic', id],
    queryFn: () => discourse.topic(id),
    enabled: id > 0,
    staleTime: 15_000
  })
}

/** Build a user_id -> user lookup by merging the `users` arrays across list pages. */
export function mergeUsers(pages: TopicListResponse[] | undefined): Map<number, DiscourseUser> {
  const map = new Map<number, DiscourseUser>()
  for (const page of pages ?? []) {
    for (const u of page.users ?? []) map.set(u.id, u)
  }
  return map
}

export function useNotifications() {
  return useInfiniteQuery({
    queryKey: ['notifications'],
    queryFn: ({ pageParam }) => discourse.notifications(false, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, all) =>
      last.notifications.length >= 30 ? all.length * 30 : undefined,
    staleTime: 15_000
  })
}

export function useUserProfile(username: string) {
  return useQuery({
    queryKey: ['user', username],
    queryFn: () => discourse.user(username),
    enabled: !!username,
    staleTime: 60_000
  })
}

export function useUserSummary(username: string) {
  return useQuery({
    queryKey: ['user-summary', username],
    queryFn: () => discourse.userSummary(username),
    enabled: !!username,
    staleTime: 60_000
  })
}

export function useBookmarks(username: string | undefined) {
  return useQuery({
    queryKey: ['bookmarks', username],
    queryFn: () => discourse.userBookmarks(username as string),
    enabled: !!username,
    staleTime: 15_000
  })
}

export function usePrivateMessages(username: string | undefined) {
  return useQuery({
    queryKey: ['pms', username],
    queryFn: () => discourse.privateMessages(username as string),
    enabled: !!username,
    staleTime: 15_000
  })
}

export function useDrafts(enabled: boolean) {
  return useQuery({
    queryKey: ['drafts'],
    queryFn: () => discourse.drafts(),
    enabled,
    staleTime: 15_000
  })
}

export function useSearch(term: string, enabled: boolean) {
  return useQuery({
    queryKey: ['search', term],
    queryFn: () => discourse.search(term),
    enabled: enabled && term.trim().length > 1,
    staleTime: 30_000
  })
}
