import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { runCommand } from '../utils/exec.js'
import type { JobContext } from './index.js'

type ModEntry = {
  id: string
  name: string
  sourceType: 'url' | 'upload' | 'nexus' | 'manual'
  source?: string
  enabled: boolean
  status: 'installed' | 'disabled' | 'failed'
  installedAt: string
  updatedAt: string
  folderName: string
  error?: string | null
}

type ModConfig = {
  serverId: string
  installPath: string
  modsPath: string
  stagingPath: string
  mods: ModEntry[]
  updatedAt: string
}

type ModPayload = {
  server_id?: string
  installPath?: string
  install_path?: string
  name?: string
  url?: string
  fileName?: string
  fileBase64?: string
  modId?: string
}

function readPayload(payload: unknown): ModPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Missing mod payload')
  return payload as ModPayload
}

function requireServer(payload: unknown) {
  const input = readPayload(payload)
  const serverId = input.server_id
  const installPath = input.installPath || input.install_path
  if (!serverId) throw new Error('Missing server_id')
  if (!installPath) throw new Error('Missing installPath')
  return { serverId, installPath: path.resolve(installPath), input }
}

function modBaseRoot() {
  return path.resolve(process.env.APEXGSP_MOD_ROOT || '/opt/apexgsp/mods')
}

function serverModRoot(serverId: string) {
  return path.join(modBaseRoot(), serverId)
}

function serverModsPath(installPath: string) {
  return path.join(installPath, 'Mods')
}

function configPath(serverId: string) {
  return path.join(serverModRoot(serverId), 'mods.json')
}

function safeFolderName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || 'mod'
}

function guessNameFromUrl(url: string) {
  try {
    const parsed = new URL(url)
    const file = path.basename(parsed.pathname).replace(/\.(zip|7z|rar)$/i, '')
    if (/nexusmods\.com/i.test(parsed.hostname)) {
      const parts = parsed.pathname.split('/').filter(Boolean)
      const modIndex = parts.indexOf('mods')
      if (modIndex >= 0 && parts[modIndex + 1]) return `Nexus Mod ${parts[modIndex + 1]}`
    }
    return safeFolderName(file || parsed.hostname)
  } catch {
    return 'Downloaded Mod'
  }
}

async function readConfig(serverId: string, installPath: string): Promise<ModConfig> {
  try {
    const text = await fs.readFile(configPath(serverId), 'utf8')
    const parsed = JSON.parse(text) as ModConfig
    return { ...parsed, installPath, modsPath: serverModsPath(installPath), stagingPath: path.join(serverModRoot(serverId), 'staging'), mods: parsed.mods || [] }
  } catch {
    return { serverId, installPath, modsPath: serverModsPath(installPath), stagingPath: path.join(serverModRoot(serverId), 'staging'), mods: [], updatedAt: new Date().toISOString() }
  }
}

async function writeConfig(config: ModConfig) {
  await fs.mkdir(path.dirname(configPath(config.serverId)), { recursive: true })
  await fs.writeFile(configPath(config.serverId), `${JSON.stringify({ ...config, updatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8')
}

async function report(ctx: JobContext | undefined, progress: number, message: string, extra: Record<string, unknown> = {}) {
  await ctx?.reportProgress({ progress, message, ...extra })
}

async function downloadFile(url: string, destination: string) {
  const response = await fetch(url, { headers: { 'user-agent': 'ApexGSP Mod Manager' } })
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length < 64) throw new Error('Download was empty or too small')
  await fs.writeFile(destination, buffer)
}

async function extractZip(zipPath: string, destination: string) {
  await fs.mkdir(destination, { recursive: true })
  const unzip = await runCommand('unzip', ['-oq', zipPath, '-d', destination], 300_000)
  if (!unzip.ok) throw new Error(`unzip failed: ${unzip.stderr || unzip.error || 'unknown error'}`)
}

async function findInstallRoot(extractPath: string) {
  const entries = await fs.readdir(extractPath, { withFileTypes: true })
  const dirs = entries.filter(entry => entry.isDirectory()).map(entry => path.join(extractPath, entry.name))
  for (const dir of dirs) {
    const nested = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    if (nested.some(entry => entry.name.toLowerCase() === 'modinfo.xml')) return dir
  }
  if (entries.some(entry => entry.name.toLowerCase() === 'modinfo.xml')) return extractPath
  if (dirs.length === 1) return dirs[0]
  return extractPath
}

async function installExtractedMod(config: ModConfig, sourceDir: string, name: string, sourceType: ModEntry['sourceType'], source?: string) {
  await fs.mkdir(config.modsPath, { recursive: true })
  const id = randomUUID()
  const folderName = `${safeFolderName(name)}-${id.slice(0, 8)}`
  const destination = path.join(config.modsPath, folderName)
  await fs.cp(sourceDir, destination, { recursive: true, force: true })
  const now = new Date().toISOString()
  const entry: ModEntry = { id, name, sourceType, source, enabled: true, status: 'installed', installedAt: now, updatedAt: now, folderName, error: null }
  config.mods = [entry, ...config.mods]
  await writeConfig(config)
  return entry
}

export async function listMods(payload: unknown) {
  const { serverId, installPath } = requireServer(payload)
  const config = await readConfig(serverId, installPath)
  return { message: 'Mods loaded', config }
}

export async function installModFromUrl(payload: unknown, ctx?: JobContext) {
  const { serverId, installPath, input } = requireServer(payload)
  if (!input.url) throw new Error('Missing mod URL')
  const url = input.url.trim()
  if (!/^https?:\/\//i.test(url)) throw new Error('Only http/https URLs are supported')
  const config = await readConfig(serverId, installPath)
  const name = input.name?.trim() || guessNameFromUrl(url)
  const sourceType: ModEntry['sourceType'] = /nexusmods\.com/i.test(url) ? 'nexus' : 'url'
  const workDir = path.join(config.stagingPath, randomUUID())
  const archivePath = path.join(workDir, 'mod.zip')

  await report(ctx, 5, 'Preparing mod install')
  await fs.mkdir(workDir, { recursive: true })
  await report(ctx, 20, 'Downloading mod archive')
  await downloadFile(url, archivePath)
  await report(ctx, 55, 'Extracting mod archive')
  const extractPath = path.join(workDir, 'extract')
  await extractZip(archivePath, extractPath)
  await report(ctx, 75, 'Detecting mod folder')
  const installRoot = await findInstallRoot(extractPath)
  await report(ctx, 90, 'Applying mod to server')
  const mod = await installExtractedMod(config, installRoot, name, sourceType, url)
  await fs.rm(workDir, { recursive: true, force: true })
  await report(ctx, 100, 'Mod installed', { mod })
  return { message: 'Mod installed', mod, config: await readConfig(serverId, installPath) }
}

export async function installModFromUpload(payload: unknown, ctx?: JobContext) {
  const { serverId, installPath, input } = requireServer(payload)
  if (!input.fileBase64) throw new Error('Missing uploaded file data')
  const config = await readConfig(serverId, installPath)
  const name = input.name?.trim() || safeFolderName((input.fileName || 'uploaded-mod').replace(/\.zip$/i, ''))
  const workDir = path.join(config.stagingPath, randomUUID())
  const archivePath = path.join(workDir, safeFolderName(input.fileName || 'mod.zip'))

  await report(ctx, 10, 'Preparing uploaded mod')
  await fs.mkdir(workDir, { recursive: true })
  await fs.writeFile(archivePath, Buffer.from(input.fileBase64, 'base64'))
  await report(ctx, 45, 'Extracting uploaded mod')
  const extractPath = path.join(workDir, 'extract')
  await extractZip(archivePath, extractPath)
  await report(ctx, 75, 'Detecting mod folder')
  const installRoot = await findInstallRoot(extractPath)
  await report(ctx, 90, 'Applying mod to server')
  const mod = await installExtractedMod(config, installRoot, name, 'upload', input.fileName)
  await fs.rm(workDir, { recursive: true, force: true })
  await report(ctx, 100, 'Uploaded mod installed', { mod })
  return { message: 'Uploaded mod installed', mod, config: await readConfig(serverId, installPath) }
}

export async function removeMod(payload: unknown) {
  const { serverId, installPath, input } = requireServer(payload)
  if (!input.modId) throw new Error('Missing modId')
  const config = await readConfig(serverId, installPath)
  const mod = config.mods.find(entry => entry.id === input.modId)
  if (!mod) throw new Error('Mod not found')
  await fs.rm(path.join(config.modsPath, mod.folderName), { recursive: true, force: true })
  config.mods = config.mods.filter(entry => entry.id !== input.modId)
  await writeConfig(config)
  return { message: 'Mod removed', config }
}
