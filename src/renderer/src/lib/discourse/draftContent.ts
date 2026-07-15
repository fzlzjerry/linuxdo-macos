// A Discourse draft stores the composer state as a JSON string in `DraftItem.draft`.
// These are the fields we can replay back into the composer when resuming a draft.
export interface DraftContent {
  reply?: string
  title?: string
  categoryId?: number
  tags?: string[]
  recipients?: string
  action?: string
}

/** Parse the serialized composer state; tolerates missing/garbage input. */
export function parseDraftContent(raw?: string): DraftContent {
  if (!raw) return {}
  try {
    const d = JSON.parse(raw) as Record<string, unknown>
    const tags = Array.isArray(d.tags)
      ? d.tags.filter((t): t is string => typeof t === 'string')
      : undefined
    const recipients =
      typeof d.recipients === 'string'
        ? d.recipients
        : typeof d.targetRecipients === 'string'
          ? d.targetRecipients
          : Array.isArray(d.targetRecipients)
            ? d.targetRecipients.filter((r): r is string => typeof r === 'string').join(',')
            : undefined
    return {
      reply: typeof d.reply === 'string' ? d.reply : undefined,
      title: typeof d.title === 'string' ? d.title : undefined,
      categoryId: typeof d.categoryId === 'number' ? d.categoryId : undefined,
      tags,
      recipients,
      action: typeof d.action === 'string' ? d.action : undefined
    }
  } catch {
    return {}
  }
}
