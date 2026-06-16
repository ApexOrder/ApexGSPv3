import express from 'express'
import type { DaemonConfig } from './config.js'

export function createServer(config: DaemonConfig) {
  const app = express()
  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      node_id: config.nodeId ?? null,
      daemon_version: '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    })
  })

  app.get('/metrics', (_req, res) => {
    const mem = process.memoryUsage()
    res.json({
      uptime: process.uptime(),
      memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal },
      platform: process.platform,
      timestamp: new Date().toISOString(),
    })
  })

  return app
}
