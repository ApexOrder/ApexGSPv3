import type { JobContext } from './index.js'

export async function createServer(payload: unknown, ctx?: JobContext) {
  await ctx?.reportProgress({ progress: 100, message: 'create_server job received', payload })

  return {
    message: 'create_server job received',
    payload,
  }
}
