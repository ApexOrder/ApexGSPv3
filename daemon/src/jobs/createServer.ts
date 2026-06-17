import fs from 'node:fs/promises'
import path from 'node:path'
import { runCommand } from '../utils/exec.js'
import type { JobContext } from './index.js'

const DEFAULT_SERVERS_ROOT = '/opt/apexgsp/servers'
const SERVER_EXECUTABLES = ['7DaysToDieServer.x86_64', '7DaysToDieServer.x86']

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

async function createFolderLayout(root: string, installPath: string) {
  await fs.mkdir(root, { recursive: true })
  await fs.mkdir(installPath, { recursive: true })
  await fs.mkdir(path.join(installPath, 'Saves'), { recursive: true })
  await fs.mkdir(path.join(installPath, 'Logs'), { recursive: true })
  await fs.mkdir(path.join(installPath, 'Backups'), { recursive: true })
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function findServerExecutable(installPath: string) {
  for (const fileName of SERVER_EXECUTABLES) {
    const executablePath = path.join(installPath, fileName)
    if (await pathExists(executablePath)) return executablePath
  }

  return null
}

async function findSteamToolPath() {
  const which = await runCommand('which', ['steamcmd'])
  if (which.ok && which.stdout) return which.stdout.split('\n')[0]

  for (const candidate of ['/usr/games/steamcmd', '/usr/bin/steamcmd', '/usr/local/bin/steamcmd']) {
    const exists = await runCommand('test', ['-x', candidate])
    if (exists.ok) return candidate
  }

  return null
}

export async function createServer(payload: unknown, ctx?: JobContext) {
  const input = readPayload(payload)
  const game = input.game || '7dtd'

  if (!['7dtd', '7_days_to_die', '7-days-to-die'].includes(game)) {
    throw new Error(`Unsupported game for create_server: ${game}`)
  }

  const target = resolveInstallTarget(input)

  await ctx?.reportProgress({ progress: 20, message: 'create_server request validated', game: '7dtd', path: target.installPath })
  await ctx?.reportProgress({ progress: 35, message: 'Creating server folder layout', path: target.installPath })

  await createFolderLayout(target.root, target.installPath)

  const existingExecutable = await findServerExecutable(target.installPath)
  if (existingExecutable) {
    await ctx?.reportProgress({ progress: 100, message: '7 Days To Die server already installed', path: target.installPath, executablePath: existingExecutable })

    return {
      message: '7 Days To Die server already installed',
      game: '7dtd',
      appId: '294420',
      installed: true,
      alreadyInstalled: true,
      executablePath: existingExecutable,
      ...target,
    }
  }

  const steamToolPath = await findSteamToolPath()
  if (!steamToolPath) throw new Error('SteamCMD is not installed. Run install_steamcmd first.')

  await ctx?.reportProgress({ progress: 45, message: 'SteamCMD found, ready to install server', path: steamToolPath })

  return {
    message: 'SteamCMD found, ready to install server',
    game: '7dtd',
    appId: '294420',
    installed: false,
    provisioned: true,
    steamcmdPath: steamToolPath,
    ...target,
  }
}
