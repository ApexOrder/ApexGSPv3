import type { DaemonConfig } from './config.js'

export class HeartbeatService {
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private config: DaemonConfig) {}

  start(): void {
    if (this.timer) return
    console.log(`[heartbeat] Starting — interval ${this.config.heartbeatIntervalMs}ms`)
    this.send()
    this.timer = setInterval(() => this.send(), this.config.heartbeatIntervalMs)
  }

  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
    console.log('[heartbeat] Stopped')
  }

  private async send(): Promise<void> {
    if (!this.config.nodeId || !this.config.nodeSecret) {
      console.warn('[heartbeat] Missing credentials — skipping')
      return
    }

    const url = `${this.config.panelUrl.replace(/\/$/, '')}/functions/v1/node-api/heartbeat`

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          node_id: this.config.nodeId,
          node_secret: this.config.nodeSecret,
          daemon_version: '1.0.0',
          metadata: {
            uptime: process.uptime(),
            memory_rss: process.memoryUsage().rss,
            platform: process.platform,
          },
        }),
        signal: AbortSignal.timeout(10_000),
      })

      if (res.ok) {
        const data = (await res.json()) as { timestamp: string }
        console.log(`[heartbeat] OK — ${data.timestamp}`)
      } else {
        console.error(`[heartbeat] Failed (${res.status}): ${await res.text()}`)
      }
    } catch (err) {
      console.error('[heartbeat] Network error:', (err as Error).message)
    }
  }
}
