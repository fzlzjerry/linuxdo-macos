import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ gfm: true, breaks: true })

/** Local markdown → sanitized HTML. Used for the composer preview and for
    optimistic (pending) posts before the server-cooked version arrives.
    `uploadMap` rewrites upload:// short urls to absolute ones. */
export function renderMarkdown(raw: string, uploadMap?: Map<string, string>): string {
  let source = raw
  uploadMap?.forEach((real, short) => {
    source = source.split(short).join(real)
  })
  return DOMPurify.sanitize(marked.parse(source) as string)
}
