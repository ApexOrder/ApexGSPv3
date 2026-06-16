import { loadConfig } from './config.js'
import { register } from './register.js'
import { HeartbeatService } from './heartbeat.js'
import { createServer } from './server.js'

async function main() {
  console.log('=== apexgspd v1.0.0 ===')

  let config = loadConfig()

  if (!config.panelUrl) {
    console.error('Error: PANEL_URL environment variable is required')
    process.exit(1)
  }

  // Register on first boot if token provided but not yet registered
  if (config.token && !config.nodeId) {
    console.log('[main] Registration token found — registering with panel...')
    try {
      config = await register(config)
    } catch (err) {
      console.error('[main] Registration failed:', (err as Error).message)
      process.exit(1)
    }
  }

  if (!config.nodeId || !config.nodeSecret) {
    console.error('Error: Node not registered. Set NODE_TOKEN and PANEL_URL to register.')
    process.exit(1)
  }

  const app = createServer(config)
  app.listen(config.port, () => {
    console.log(`[main] HTTP server listening on port ${config.port}`)
  })

  const heartbeat = new HeartbeatService(config)
  heartbeat.start()

  function shutdown() {
    console.log('[main] Shutting down...')
    heartbeat.stop()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  console.log(`[main] Node ID: ${config.nodeId}`)
  console.log(`[main] Panel:   ${config.panelUrl}`)
  console.log('[main] Ready.')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
