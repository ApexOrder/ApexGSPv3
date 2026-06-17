import { testPing } from './testPing.js'
import { detectTools } from './detectTools.js'
import { installSteamcmd } from './installSteamcmd.js'
import { createServer } from './createServer.js'
import { restartServer, startServer, stopServer } from './manageServer.js'

export interface JobContext {
  reportProgress: (result: Record<string, unknown>) => Promise<void>
}

export async function runJob(type: string, payload: unknown, ctx?: JobContext) {
  switch (type) {
    case 'test_ping':
      return testPing()
    case 'detect_tools':
      return detectTools()
    case 'install_steamcmd':
      return installSteamcmd(payload, ctx)
    case 'create_server':
      return createServer(payload, ctx)
    case 'start_server':
      return startServer(payload, ctx)
    case 'stop_server':
      return stopServer(payload, ctx)
    case 'restart_server':
      return restartServer(payload, ctx)
    default:
      throw new Error(`Unsupported job type: ${type}`)
  }
}
