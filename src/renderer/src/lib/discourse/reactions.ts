import { LINUXDO_ORIGIN } from './urls'

// linux.do's enabled reaction set: reaction id → unicode glyph. Ids outside this
// map (custom emoji) fall back to a twemoji PNG served by linux.do.
const EMOJI: Record<string, string> = {
  heart: '❤️',
  '+1': '👍',
  laughing: '😄',
  open_mouth: '😮',
  clap: '👏',
  cry: '😢',
  angry: '😠',
  hugs: '🤗',
  thinking: '🤔',
  rocket: '🚀',
  '-1': '👎',
  confetti_ball: '🎉',
  tada: '🎉',
  fire: '🔥'
}

/** Enabled reaction ids, in the order the picker lists them. */
export const ENABLED_REACTIONS: string[] = [
  'heart',
  '+1',
  'laughing',
  'open_mouth',
  'clap',
  'cry',
  'angry',
  'hugs',
  'thinking',
  'rocket',
  '-1',
  'confetti_ball',
  'tada',
  'fire'
]

/** Resolve a reaction id to a unicode glyph, or an image URL for custom emoji. */
export function reactionEmoji(id: string): { char?: string; img?: string } {
  const char = EMOJI[id]
  if (char) return { char }
  return { img: `${LINUXDO_ORIGIN}/images/emoji/twitter/${id}.png?v=12` }
}
