import {
  Award,
  Book,
  BookOpen,
  Briefcase,
  Code,
  Coins,
  Copy,
  CreditCard,
  Droplet,
  Folder,
  HardDrive,
  Lightbulb,
  Megaphone,
  MessagesSquare,
  Newspaper,
  PiggyBank,
  Rocket,
  Rss,
  Share2,
  Sprout,
  Tornado,
  Users,
  Waves
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Category } from '../../lib/discourse/types'

// linux.do renders categories with style_type='icon' and a Font Awesome 6 name.
// Map the names it actually uses to their closest lucide equivalents (our icon set).
const FA_TO_LUCIDE: Record<string, LucideIcon> = {
  code: Code,
  seedling: Sprout,
  'square-share-nodes': Share2,
  'hard-drive': HardDrive,
  book: Book,
  'credit-card': CreditCard,
  briefcase: Briefcase,
  'book-open-reader': BookOpen,
  newspaper: Newspaper,
  rss: Rss,
  'piggy-bank': PiggyBank,
  droplet: Droplet,
  lightbulb: Lightbulb,
  hurricane: Tornado,
  comments: MessagesSquare,
  bullhorn: Megaphone,
  award: Award,
  users: Users,
  clone: Copy,
  coins: Coins,
  rocket: Rocket,
  water: Waves
}

/** Pick a glyph color that stays legible on the category's own color. */
function readableOn(hex?: string): string {
  const h = (hex ?? '').replace('#', '')
  if (h.length < 6) return 'oklch(1 0 0 / 0.96)'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return lum > 0.62 ? 'oklch(0.22 0 0)' : 'oklch(1 0 0 / 0.96)'
}

export function CategoryIcon({
  category,
  size = 34,
  radius = 8
}: {
  category: Pick<Category, 'color' | 'icon' | 'emoji' | 'style_type' | 'name'>
  size?: number
  radius?: number
}): JSX.Element {
  const bg = `#${(category.color || '888888').replace('#', '')}`
  const glyph = Math.round(size * 0.52)
  const Icon = (category.icon && FA_TO_LUCIDE[category.icon]) || Folder

  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: radius,
        background: bg,
        flexShrink: 0
      }}
    >
      <Icon size={glyph} strokeWidth={2.2} color={readableOn(category.color)} />
    </span>
  )
}
