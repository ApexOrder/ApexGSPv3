import fs from 'node:fs/promises'
import path from 'node:path'
import { runCommand } from '../utils/exec.js'
import type { JobContext } from './index.js'

type WorkshopMod = {
  id: string
  name?: string
  enabled: boolean
  installedAt?: string | null
  updatedAt?: string | null
  appliedAt?: string | null
  status?: string | null
  error?: string | null
}

type WorkshopConfig = {
  serverId: string
  installPath: string
  appId: string
  workshopRoot: string
  modsPath: string
  mods: WorkshopMod[]
  updatedAt: string
}

type WorkshopPayload = {
  server_id?: string
  installPath?: string
  install_path?: string
  appId?: string
  mods?: WorkshopMod[]
  modIds?: string[]
}

const DEFAULT_APP_ID = '251570'

function readPayload(payload: unknown): WorkshopPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Missing workshop payload')
  return payload as WorkshopPayload
}

function requireServer(payload: unknown) {
  const input = readPayload(payload)
  const serverId = input.server_id
  const installPath = input.installPath || input.install_path
  if (!serverId) throw new Error('Missing server_id')
  if (!installPath) throw new Error('Missing installPath')
  return { serverId, installPath: path.resolve(installPath), input }
}

function workshopBaseRoot() {
  return path.resolve(process.env.APEXGSP_WORKSHOP_ROOT || '/opt/apexgsp/workshop')
}

function serverWorkshopRoot(serverId: string) {
  return path.join(workshopBaseRoot(), serverId)
}

function configPath(serverId: string) {
  return path.join(serverWorkshopRoot(serverId), 'workshop.json')
}

function serverModsPath(installPath: string) {
  return path.join(installPath, 'Mods')
}

function safeId(value: string) {
  const id = String(value || '').trim()
  if (!/^\d{3,20}$/.test(id)) throw new Error(`Invalid Workshop ID: ${value}`)
  return id
}

function safeFolderName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || 'workshop-mod'
}

function normaliseMods(input: WorkshopPayload, existing: WorkshopMod[] = []) {
  const byId = new Map(existing.map(mod => [mod.id, mod]))
  const source: WorkshopMod[] = input.mods?.length
    ? input.mods
    : (input.modIds || []).map(id => ({ id, name: '', enabled: true }))

  return source.map(raw => {
    const id = safeId(raw.id)
    const previous = byId.get(id)
    return {
      id,
      name: raw.name?.trim() || previous?.name || `Workshop ${id}`,
      enabled: raw.enabled ?? previous?.enabled ?? true,
      installedAt: previous?.installedAt || null,
      updatedAt: previous?.updatedAt || null,
      appliedAt: previous?.appliedAt || null,
      status: previous?.status || null,
      error: previous?.error || null,
    }
  })
}

async function readConfig(serverId: string, installPath: string, appId = DEFAULT_APP_ID): Promise<WorkshopConfig> {
  try {
    const text = await fs.readFile(configPath(serverId), 'utf8')
    const parsed = JSON.parse(text) as WorkshopConfig
    return { ...parsed, installPath, appId: parsed.appId || appId, workshopRoot: serverWorkshopRoot(serverId), modsPath: parsed.modsPath || serverModsPath(installPath), mods: parsed.mods || [] }
  } catch {
    return { serverId, installPath, appId, workshopRoot: serverWorkshopRoot(serverId), modsPath: serverModsPath(installPath), mods: [], updatedAt: new Date().toISOString() }
  }
}

async function writeConfig(config: WorkshopConfig) {
  await fs.mkdir(config.workshopRoot, { recursive: true })
  await fs.writeFile(configPath(config.serverId), `${JSON.stringify({ ...config, updatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8')
}

async function exists(target: string) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function findSteamcmd() {
  const candidates = ['steamcmd', '/usr/games/steamcmd', '/usr/bin/steamcmd', '/usr/local/bin/steamcmd']
  for (const command of candidates) {
    const result = await runCommand(command, ['+quit'], 20_000)
    if (result.ok) return command
  }
  throw new Error('SteamCMD not found. Install SteamCMD on the daemon host first.')
}

async function report(ctx: JobContext | undefined, progress: number, message: string, extra: Record<string, unknown> = {}) {
  await ctx?.reportProgress({ progress, message, ...extra })
}

function downloadedWorkshopPath(config: WorkshopConfig, modId: string) {
  return path.join(config.workshopRoot, 'steamapps', 'workshop', 'content', config.appId, modId)
}

async function applyMod(config: WorkshopConfig, mod: WorkshopMod) {
  const source = downloadedWorkshopPath(config, mod.id)
  if (!(await exists(source))) throw new Error(`Downloaded Workshop folder not found for ${mod.id}`)
  const destination = path.join(config.modsPath, `${safeFolderName(mod.name || `workshop-${mod.id}`)}-${mod.id}`)
  await fs.mkdir(config.modsPath, { recursive: true })
  await fs.cp(source, destination, { recursive: true, force: true })
  mod.appliedAt = new Date().toISOString()
  mod.status = 'applied'
  mod.error = null
  return destination
}

export async function listWorkshopMods(payload: unknown) {
  const { serverId, installPath, input } = requireServer(payload)
  const config = await readConfig(serverId, installPath, input.appId || DEFAULT_APP_ID)
  return { message: 'Workshop mods loaded', config }
}

export async function saveWorkshopMods(payload: unknown) {
  const { serverId, installPath, input } = requireServer(payload)
  const existing = await readConfig(serverId, installPath, input.appId || DEFAULT_APP_ID)
  const config: WorkshopConfig = {
    ...existing,
    serverId,
    installPath,
    appId: input.appId || existing.appId || DEFAULT_APP_ID,
    workshopRoot: serverWorkshopRoot(serverId),
    modsPath: serverModsPath(installPath),
    mods: normaliseMods(input, existing.mods),
    updatedAt: new Date().toISOString(),
  }
  await writeConfig(config)
  return { message: 'Workshop mods saved', config }
}

export async function updateWorkshopMods(payload: unknown, ctx?: JobContext) {
  const { serverId, installPath, input } = requireServer(payload)
  const config = await readConfig(serverId, installPath, input.appId || DEFAULT_APP_ID)
  if (input.mods || input.modIds) config.mods = normaliseMods(input, config.mods)
  config.modsPath = serverModsPath(installPath)
  const enabled = config.mods.filter(mod => mod.enabled)
  if (enabled.length === 0) throw new Error('No enabled Workshop mods to update')

  await fs.mkdir(config.workshopRoot, { recursive: true })
  await fs.mkdir(config.modsPath, { recursive: true })
  const steamcmd = await findSteamcmd()
  await report(ctx, 5, 'SteamCMD found', { steamcmd })

  for (let i = 0; i < enabled.length; i++) {
    const mod = enabled[i]
    const progress = Math.round(10 + (i / enabled.length) * 55)
    await report(ctx, progress, `Downloading Workshop mod ${mod.id}`, { modId: mod.id })

    const result = await runCommand(steamcmd, [
      '+force_install_dir', config.workshopRoot,
      '+login', 'anonymous',
      '+workshop_download_item', config.appId, mod.id,
      '+quit',
    ], 900_000)

    const now = new Date().toISOString()
    if (!result.ok) {
      mod.status = 'failed'
      mod.error = result.stderr || result.error || 'SteamCMD failed'
      mod.updatedAt = now
      await writeConfig(config)
      throw new Error(`Workshop mod ${mod.id} failed: ${mod.error}`)
    }

    mod.status = 'downloaded'
    mod.error = null
    mod.installedAt = mod.installedAt || now
    mod.updatedAt = now
  }

  for (let i = 0; i < enabled.length; i++) {
    const mod = enabled[i]
    const progress = Math.round(70 + (i / enabled.length) * 25)
    await report(ctx, progress, `Applying Workshop mod ${mod.id}`, { modId: mod.id })
    await applyMod(config, mod)
  }

  await writeConfig(config)
  await report(ctx, 100, 'Workshop mods downloaded and applied', { mods: enabled.map(mod => mod.id), modsPath: config.modsPath })
  return { message: 'Workshop mods downloaded and applied', config }
}
