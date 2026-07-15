import type { DiscourseRequest, DiscourseResponse } from '../../shared/api'

type RequestFn = <T>(req: DiscourseRequest) => Promise<DiscourseResponse<T>>

interface BusMessage {
  global_id?: number
  message_id: number
  channel: string
  data: unknown
}

/**
 * Discourse MessageBus client. Polls `/message-bus/{clientId}/poll` for the
 * subscribed channels (non-long-poll, `dlp=t`) and reports any new messages.
 * Used to keep notification / unread badges live.
 */
export class MessageBus {
  private readonly clientId =
    Math.random().toString(36).slice(2, 12) + Date.now().toString(36)
  private positions = new Map<string, number>()
  private channels: string[] = []
  private seq = 0
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(
    private readonly request: RequestFn,
    private readonly onMessages: (msgs: BusMessage[]) => void,
    private readonly intervalMs = 20_000
  ) {}

  setChannels(channels: string[]): void {
    for (const c of channels) if (!this.positions.has(c)) this.positions.set(c, -1)
    this.channels = channels
  }

  start(): void {
    if (this.running) return
    this.running = true
    void this.loop()
  }

  stop(): void {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private async loop(): Promise<void> {
    if (!this.running) return
    if (this.channels.length > 0) {
      const body: Record<string, unknown> = { __seq: this.seq++ }
      for (const c of this.channels) body[c] = this.positions.get(c) ?? -1
      try {
        const res = await this.request<BusMessage[]>({
          path: `/message-bus/${this.clientId}/poll?dlp=t`,
          method: 'POST',
          form: true,
          body
        })
        const msgs = Array.isArray(res.json) ? res.json : []
        for (const m of msgs) {
          if (typeof m.message_id === 'number') this.positions.set(m.channel, m.message_id)
        }
        if (msgs.length) this.onMessages(msgs)
      } catch {
        /* transient; try again next tick */
      }
    }
    if (this.running) this.timer = setTimeout(() => void this.loop(), this.intervalMs)
  }
}
