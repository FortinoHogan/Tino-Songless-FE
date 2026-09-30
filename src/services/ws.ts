import type { WebSocketEvent } from '../types/game'

export type ConnStatus = 'connecting' | 'open' | 'closed'

export class Socket {
  private ws?: WebSocket
  private tries = 0
  private stopped = false
  private last = -1
  private timer?: number

  constructor(
    private url: string,
    private onEvent: (e: WebSocketEvent) => void,
    private onStatus: (s: ConnStatus) => void,
  ) {}

  connect() {
    this.onStatus('connecting')

    const ws = (this.ws = new WebSocket(this.url))

    ws.onopen = () => {
      this.tries = 0
      this.onStatus('open')
    }

    ws.onmessage = (m) => {
      try {
        const e = JSON.parse(String(m.data)) as WebSocketEvent

        if (typeof e.seq === 'number') {
          if (e.seq <= this.last) return
          this.last = e.seq
        }

        this.onEvent(e)
      } catch {}
    }

    ws.onclose = () => {
      if (this.stopped) return

      this.onStatus('closed')

      this.timer = window.setTimeout(
        () => this.connect(),
        Math.min(1000 * 2 ** this.tries++, 10000),
      )
    }
  }

  close() {
    this.stopped = true
    window.clearTimeout(this.timer)
    this.ws?.close()
  }
}
