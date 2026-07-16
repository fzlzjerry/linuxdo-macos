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
  unread_posts?: number
  new_posts?: number
  last_read_post_number?: number | null
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
  /** linux.do sets 'icon' (Font Awesome name in `icon`) or 'emoji'; default 'square'. */
  style_type?: 'square' | 'icon' | 'emoji'
  icon?: string | null
  emoji?: string | null
  slug: string
  topic_count: number
  post_count: number
  description_excerpt?: string
  description?: string
  parent_category_id?: number
  read_restricted?: boolean
  position?: number
  topics_week?: number
  has_children?: boolean
  subcategory_ids?: number[]
  /** Embedded child categories (linux.do's Lv1/Lv2/Lv3) when include_subcategories=true. */
  subcategory_list?: Category[]
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
  bookmark_id?: number
  boosts?: Boost[]
  can_boost?: boolean
  // discourse-solved plugin
  can_accept_answer?: boolean
  can_unaccept_answer?: boolean
  accepted_answer?: boolean
  // discourse-poll plugin
  polls?: Poll[]
  polls_votes?: Record<string, string[]>
  can_vote?: boolean
  /** Client-only: an optimistic post awaiting server confirmation. */
  pending?: boolean
}

// ---- Polls (discourse-poll) ----
export interface PollOption {
  id: string
  html: string
  votes?: number
}
export interface Poll {
  name: string
  type: 'regular' | 'multiple' | 'number' | string
  status: 'open' | 'closed' | string
  results: 'always' | 'on_vote' | 'on_close' | 'staff_only' | string
  public?: boolean
  chart_type?: string
  min?: number
  max?: number
  options: PollOption[]
  voters?: number
}

/** discourse-boosts: a short "boost" (🚀) comment attached to a post. */
export interface Boost {
  id: number
  cooked: string
  can_delete?: boolean
  can_flag?: boolean
  /** Null for deleted/anonymized accounts — always render defensively. */
  user: DiscourseUser | null
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
  highest_post_number?: number
  last_read_post_number?: number | null
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
    notification_level?: NotificationLevel
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

export type ListingFilter = 'latest' | 'new' | 'unread' | 'top' | 'hot' | 'posted' | 'read'
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
  grant_count?: number
  allow_title?: boolean
}
export interface BadgeType {
  id: number
  name: string
  sort_order?: number
}
export interface BadgesResponse {
  badges: Badge[]
  badge_types: BadgeType[]
}

// ---- Groups directory ----
export interface GroupItem {
  id: number
  name: string
  full_name?: string | null
  user_count?: number
  title?: string | null
  flair_url?: string | null
  flair_bg_color?: string | null
  flair_color?: string | null
  bio_excerpt?: string | null
  visibility_level?: number
}
export interface GroupsResponse {
  groups: GroupItem[]
  total_rows_groups?: number
  load_more_groups?: string
}
/** /u/:username/summary.json topics carry posts_count/like_count — NOT
    reply_count/bumped_at like list topics. */
export interface SummaryTopic {
  id: number
  title: string
  fancy_title?: string
  slug?: string
  posts_count?: number
  like_count?: number
  category_id?: number
  created_at?: string
}
export interface SummaryReply {
  topic_id: number
  post_number?: number
  like_count?: number
  created_at?: string
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
    replies?: SummaryReply[]
    top_categories?: Array<{ id: number; name: string; color: string; topic_count: number; post_count: number }>
  }
  badges?: Badge[]
  topics?: SummaryTopic[]
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

// ---- Emojis (/emojis.json) — Discourse's own set (linux.do = twemoji + custom packs) ----
export interface DiscourseEmoji {
  name: string
  url: string
  group: string
  tonable?: boolean
}
/** Keyed by group name; groups include custom packs like 'b站' / '飞书'. */
export type EmojiGroups = Record<string, DiscourseEmoji[]>

// ---- User activity stream (/user_actions.json) ----
export interface UserAction {
  action_type: number // 4=topic, 5=reply(post), 1=like given, 2=like received…
  title?: string
  excerpt?: string
  slug?: string
  topic_id?: number
  post_number?: number
  post_id?: number
  created_at: string
  category_id?: number
  username?: string
  acting_username?: string
  acting_avatar_template?: string
}
export interface UserActionsResponse {
  user_actions: UserAction[]
}

// ---- AI bot conversations (private_message topics) ----
export interface AiConversation {
  id: number
  title: string
  fancy_title?: string
  posts_count?: number
  created_at?: string
  last_posted_at?: string
  bumped_at?: string
  ai_conversation_starred?: boolean
}
export interface AiConversationsResponse {
  meta?: { page?: number; per_page?: number; has_more?: boolean }
  conversations: AiConversation[]
}

// ---- Chat (discourse-chat) ----
export interface ChatUser {
  id: number
  username: string
  name?: string
  avatar_template?: string
}
export interface ChatChannel {
  id: number
  title?: string
  slug?: string
  description?: string
  chatable_type?: string
  status?: string
  memberships_count?: number
  last_message?: { id?: number; excerpt?: string; created_at?: string; user?: ChatUser }
  chatable?: { users?: ChatUser[] }
  current_user_membership?: { last_read_message_id?: number | null; muted?: boolean }
}
export interface ChatChannelsResponse {
  public_channels: ChatChannel[]
  direct_message_channels: ChatChannel[]
}
export interface ChatMessage {
  id: number
  message?: string
  cooked?: string
  created_at: string
  excerpt?: string
  chat_channel_id?: number
  user: ChatUser
}
export interface ChatMessagesResponse {
  messages: ChatMessage[]
  meta?: { can_load_more_future?: boolean; can_load_more_past?: boolean; target_message_id?: number }
}

// ---- Leaderboard (discourse-gamification) ----
export interface LeaderboardUser {
  id: number
  username: string
  name?: string
  avatar_template?: string
  total_score: number
  position: number
}
export interface LeaderboardResponse {
  personal?: { user?: LeaderboardUser; position?: number }
  leaderboard?: {
    id: number
    name?: string
    default_period?: number | string
    period_filter_disabled?: boolean
  }
  users: LeaderboardUser[]
}

// ---- Events (discourse-calendar / post-event) ----
export interface EventItem {
  id: number
  category_id?: number
  name?: string | null
  starts_at: string
  ends_at?: string | null
  all_day?: boolean
  timezone?: string
  post?: {
    id: number
    post_number?: number
    url?: string
    category_slug?: string
    topic?: { id: number; title?: string; fancy_title?: string }
  }
}
export interface EventsResponse {
  events: EventItem[]
}

// A flaggable post-action type from /site.json (linux.do adds custom flags like
// 凑字数 / AIGC未截图 / 违规推广 beyond the vanilla off_topic/inappropriate/spam).
export interface FlagType {
  id: number
  name_key: string
  name: string
  description?: string
  require_message?: boolean
}
export interface SiteResponse {
  post_action_types?: Array<{
    id: number
    name_key: string
    name?: string
    description?: string
    is_flag?: boolean
    require_message?: boolean
  }>
}
