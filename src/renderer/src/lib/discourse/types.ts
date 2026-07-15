// Lean Discourse domain types — only the fields the client actually reads.
// Unknown extras are tolerated (Discourse payloads are large and versioned).

export interface DiscourseUser {
  id: number
  username: string
  name?: string
  avatar_template?: string
  trust_level?: number
  admin?: boolean
  moderator?: boolean
}

export interface Poster {
  extras?: string | null
  description?: string
  user_id: number
  primary_group_id?: number | null
}

export interface TopicListItem {
  id: number
  title: string
  fancy_title?: string
  slug: string
  posts_count: number
  reply_count: number
  highest_post_number: number
  created_at: string
  last_posted_at?: string
  bumped_at: string
  pinned?: boolean
  closed?: boolean
  archived?: boolean
  unseen?: boolean
  unread?: number
  new_posts?: number
  excerpt?: string
  visible?: boolean
  liked?: boolean
  views: number
  like_count: number
  has_summary?: boolean
  last_poster_username?: string
  category_id?: number
  pinned_globally?: boolean
  posters: Poster[]
  tags?: TagLike[]
}

export interface TopicList {
  can_create_topic?: boolean
  more_topics_url?: string
  per_page?: number
  topics: TopicListItem[]
}

export interface TopicListResponse {
  users?: DiscourseUser[]
  topic_list: TopicList
}

export interface Category {
  id: number
  name: string
  color: string
  text_color?: string
  slug: string
  topic_count: number
  post_count: number
  description_excerpt?: string
  description?: string
  parent_category_id?: number
  read_restricted?: boolean
  position?: number
  topics_week?: number
}

export interface CategoryListResponse {
  category_list: { categories: Category[] }
}

export interface ActionSummary {
  id: number
  count?: number
  acted?: boolean
  can_act?: boolean
  can_undo?: boolean
}

// discourse-reactions plugin shapes. `type` is present in some payloads but the
// verified live listing omits it, so it stays optional (the client never reads it).
export interface PostReaction {
  id: string
  type?: string
  count: number
}

export interface CurrentUserReaction {
  id: string
  type?: string
  can_undo: boolean
}

export interface UserStatus {
  emoji?: string
  description?: string
}

export interface Post {
  id: number
  name?: string
  username: string
  avatar_template?: string
  created_at: string
  updated_at?: string
  cooked: string
  raw?: string
  post_number: number
  post_type?: number
  reply_count?: number
  reply_to_post_number?: number
  quote_count?: number
  incoming_link_count?: number
  reads?: number
  score?: number
  yours?: boolean
  topic_id: number
  trust_level?: number
  admin?: boolean
  moderator?: boolean
  staff?: boolean
  user_id: number
  hidden?: boolean
  can_edit?: boolean
  can_delete?: boolean
  user_title?: string | null
  primary_group_name?: string | null
  flair_name?: string | null
  flair_url?: string | null
  flair_bg_color?: string | null
  flair_color?: string | null
  user_status?: UserStatus | null
  actions_summary?: ActionSummary[]
  reactions?: PostReaction[]
  current_user_reaction?: CurrentUserReaction | null
  reaction_users_count?: number
  bookmarked?: boolean
}

export interface TopicPostStream {
  posts: Post[]
  stream?: number[]
}

export interface TopicParticipant {
  id: number
  username: string
  avatar_template?: string
  post_count?: number
}

export interface TopicDetail {
  id: number
  title: string
  fancy_title?: string
  posts_count: number
  created_at: string
  views: number
  reply_count: number
  like_count: number
  category_id?: number
  tags?: TagLike[]
  closed?: boolean
  archived?: boolean
  archetype?: string
  post_stream: TopicPostStream
  details?: {
    created_by?: DiscourseUser
    last_poster?: DiscourseUser
    participants?: TopicParticipant[]
    can_create_post?: boolean
  }
}

// linux.do returns topic tags as objects ({id, name, slug}); vanilla Discourse
// returns plain strings. Support both shapes everywhere tags are rendered.
export interface TagObject {
  id?: number
  name: string
  slug?: string
}
export type TagLike = string | TagObject

export function tagText(tag: TagLike): string {
  return typeof tag === 'string' ? tag : (tag.name ?? tag.slug ?? '')
}
export function tagKey(tag: TagLike): string {
  return typeof tag === 'string' ? tag : String(tag.id ?? tag.slug ?? tag.name)
}

export type ListingFilter = 'latest' | 'new' | 'unread' | 'top' | 'hot'
export type TopPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'all'

// Discourse PostActionType id for a "like".
export const LIKE_ACTION_ID = 2

// ---- Notifications ----
export interface NotificationItem {
  id: number
  user_id?: number
  notification_type: number
  read: boolean
  high_priority?: boolean
  created_at: string
  post_number?: number
  topic_id?: number
  slug?: string
  fancy_title?: string
  data: {
    topic_title?: string
    display_username?: string
    original_username?: string
    original_post_id?: number
    badge_name?: string
    badge_slug?: string
    badge_id?: number
    count?: number
    group_name?: string
    message?: string
    [k: string]: unknown
  }
}
export interface NotificationsResponse {
  notifications: NotificationItem[]
  total_rows_notifications?: number
  seen_notification_id?: number
  load_more_notifications?: string
}

// ---- Search ----
export interface SearchPost {
  id: number
  topic_id: number
  post_number: number
  blurb?: string
  created_at: string
  username?: string
  name?: string
  avatar_template?: string
  like_count?: number
}
export interface SearchResponse {
  posts?: SearchPost[]
  topics?: TopicListItem[]
  users?: DiscourseUser[]
  categories?: Category[]
  tags?: TagObject[]
  grouped_search_result?: {
    more_full_page_results?: boolean | null
    term?: string
    post_ids?: number[]
  }
}
export interface TypeaheadResponse {
  topics?: Array<{ id: number; title: string; slug: string; posts_count?: number }>
  users?: DiscourseUser[]
  categories?: Category[]
  tags?: TagObject[]
}

// ---- User profile ----
export interface ProfileUser {
  id: number
  username: string
  name?: string
  avatar_template?: string
  bio_cooked?: string
  bio_excerpt?: string
  created_at?: string
  last_seen_at?: string
  last_posted_at?: string
  trust_level?: number
  badge_count?: number
  profile_view_count?: number
  location?: string
  website_name?: string
  website?: string
  title?: string
  primary_group_name?: string
  flair_name?: string
  can_send_private_message?: boolean
}
export interface UserProfileResponse {
  user: ProfileUser
}
export interface Badge {
  id: number
  name: string
  description?: string
  icon?: string
  image_url?: string
  badge_type_id?: number
  slug?: string
}
export interface UserSummaryResponse {
  user_summary: {
    likes_given?: number
    likes_received?: number
    topics_entered?: number
    posts_read_count?: number
    days_visited?: number
    topic_count?: number
    post_count?: number
    time_read?: number
    recent_time_read?: number
    bookmark_count?: number
    solved_count?: number
    top_categories?: Array<{ id: number; name: string; color: string; topic_count: number; post_count: number }>
  }
  badges?: Badge[]
  topics?: TopicListItem[]
  users?: DiscourseUser[]
}

// ---- Bookmarks ----
export interface BookmarkItem {
  id: number
  created_at: string
  name?: string | null
  reminder_at?: string | null
  excerpt?: string
  bookmarkable_id: number
  bookmarkable_type: string
  title?: string
  fancy_title?: string
  topic_id?: number
  linked_post_number?: number
  post_number?: number
  slug?: string
  category_id?: number
  tags?: TagLike[]
  user?: DiscourseUser
}
export interface BookmarksResponse {
  user_bookmark_list?: { bookmarks: BookmarkItem[]; more_bookmarks_url?: string }
}

// ---- Drafts ----
export interface DraftItem {
  draft_key: string
  sequence: number
  created_at?: string
  updated_at?: string
  draft?: string
  title?: string
  excerpt?: string
  raw?: string
  topic_id?: number
  category_id?: number
}
export interface DraftsResponse {
  drafts: DraftItem[]
  no_results_help?: string
}

export type NotificationLevel = 0 | 1 | 2 | 3 // muted / regular / tracking / watching
