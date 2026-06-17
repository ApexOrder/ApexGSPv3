import path from 'node:path'
import type { JobContext } from './index.js'

const DEFAULT_SERVERS_ROOT = '/opt/apexgsp/servers'

type CreateServerPayload = {
  game?: string
  serverName?: string
  name?: string
  slug?: string
  installDir?: string
  installPath?: string
}

function readPayload(payload: unknown): CreateServerPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {}
  return payload as CreateServerPayload
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function resolveInstallTarget(payload: CreateServerPayload) {
  const name = payload.serverName || payload.name || '7 Days To Die Server'
  const slug = slugify(payload.slug || name)
  if (!slug) throw new Error('Server name or slug must contain at least one letter or number')

  const root = path.resolve(process.env.APEXGSP_SERVERS_ROOT || DEFAULT_SERVERS_ROOT)
  const requestedPath = payload.installDir || payload.installPath
  const installPath = path.resolve(requestedPath || path.join(root, slug))

  if (installPath !== root && !installPath.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Unsafe install path: server installs must stay inside ${root}`)
  }

  return { name, slug, root, installPath }
}

export async function createServer(payload: unknown, ctx?: JobContext) {
  const input = readPayload(payload)
  const game = input.game || '7dtd'

  if (!['7dtd', '7_days_to_die', '7-days-to-die'].includes(game)) {
    throw new Error(`Unsupported game for create_server: ${game}`)
  }

  const target = resolveInstallTarget(input)

  await ctx?.reportProgress({ progress: 20, message: 'create_server request validated', game: '7dtd', path: target.installPath })

  return {
    message: 'create_server request validated',
    game: '7dtd',
    appId: '294420',
    installed: false,
    ...target,
  }
}
