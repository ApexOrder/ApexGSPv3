import type { JobContext } from './index.js'

export async function getServerLogs(payload: unknown, ctx?: JobContext) {
  await ctx?.reportProgress({ progress: 100, message: 'Console request received' })

  return {
    message: 'Console request received',
    status: 'logs_unavailable',
    lines: 'Console log reading will be enabled in the next daemon patch.',
    payload,
  }
}
