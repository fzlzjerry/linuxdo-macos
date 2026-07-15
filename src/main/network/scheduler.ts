/**
 * Concurrency-limited task queue. linux.do (Discourse) rate-limits aggressively,
 * so we cap in-flight requests and serialize the overflow.
 */
export class RequestScheduler {
  private queue: Array<() => void> = []
  private active = 0

  constructor(private readonly concurrency = 4) {}

  run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const exec = (): void => {
        this.active++
        task()
          .then(resolve, reject)
          .finally(() => {
            this.active--
            const next = this.queue.shift()
            if (next) next()
          })
      }
      if (this.active < this.concurrency) exec()
      else this.queue.push(exec)
    })
  }
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
