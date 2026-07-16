import { useEffect, useState } from 'react'
import { LINUXDO_ORIGIN } from './urls'
import { EMOJI as EMOJI_TABLE } from '../emoji'
import type { EmojiGroups } from './types'

// Native glyphs for the common reaction ids — cheaper and crisper than
// loading the site's image for emoji every keyboard has.
const EMOJI: Record<string, string> = {
  heart: '❤️',
  '+1': '👍',
  thumbsup: '👍',
  laughing: '😆',
  smile: '😄',
  open_mouth: '😮',
  clap: '👏',
  cry: '😢',
  sob: '😭',
  angry: '😠',
  rage: '😡',
  hugs: '🤗',
  thinking: '🤔',
  rocket: '🚀',
  '-1': '👎',
  thumbsdown: '👎',
  confetti_ball: '🎊',
  tada: '🎉',
  fire: '🔥',
  eyes: '👀',
  joy: '😂',
  rofl: '🤣',
  wave: '👋',
  pray: '🙏',
  '100': '💯'
}

// Standard-emoji shortcodes → native glyphs, seeded from the composer's
// curated table so ids like roll_eyes / sweat_smile render without images.
const nameToChar = new Map<string, string>(Object.entries(EMOJI))
for (const e of EMOJI_TABLE) {
  if (!nameToChar.has(e.name)) nameToChar.set(e.name, e.char)
}

/** Last-resort guess before the picker has learned the real site set. */
const FALLBACK_REACTIONS: string[] = ['heart', '+1', 'laughing', 'open_mouth', 'clap', 'cry']

let enabledCache: string[] | null = null
let enabledInflight: Promise<string[]> | null = null

/** The site's actual reaction set (discourse_reactions_enabled_reactions,
 *  read from the engine page's preloaded settings). Reactions outside this
 *  list are rejected by the server — the picker must mirror it exactly. */
export function fetchEnabledReactions(): Promise<string[]> {
  if (enabledCache) return Promise.resolve(enabledCache)
  enabledInflight ??= (
    window.api?.siteSetting
      ? window.api.siteSetting('discourse_reactions_enabled_reactions')
      : Promise.resolve('')
  )
    .then((raw) => {
      const list = raw
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean)
      enabledCache = list.length > 0 ? list : FALLBACK_REACTIONS
      return enabledCache
    })
    .catch(() => {
      enabledInflight = null // allow a later retry
      return FALLBACK_REACTIONS
    })
  return enabledInflight
}

export function useEnabledReactions(): string[] {
  const [list, setList] = useState<string[]>(enabledCache ?? FALLBACK_REACTIONS)
  useEffect(() => {
    let live = true
    void fetchEnabledReactions().then((l) => {
      if (live) setList(l)
    })
    return () => {
      live = false
    }
  }, [])
  return list
}

// name → image url learned from /emojis.json (covers custom packs); filled
// by whoever has the emoji query handy (ReactionBar does).
const urlByName = new Map<string, string>()

export function primeReactionUrls(groups: EmojiGroups | undefined): void {
  if (!groups) return
  for (const list of Object.values(groups)) {
    for (const e of list) {
      if (!urlByName.has(e.name)) urlByName.set(e.name, e.url)
    }
  }
}

/** Resolve a reaction id to a native glyph, or an image URL for site emoji. */
export function reactionEmoji(id: string): { char?: string; img?: string } {
  const char = nameToChar.get(id)
  if (char) return { char }
  const known = urlByName.get(id)
  if (known) {
    return { img: known.startsWith('http') ? known : `${LINUXDO_ORIGIN}${known}` }
  }
  // linux.do serves twemoji under /images/emoji/twemoji/ (not /twitter/).
  return { img: `${LINUXDO_ORIGIN}/images/emoji/twemoji/${id}.png?v=15` }
}
