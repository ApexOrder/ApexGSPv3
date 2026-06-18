import fs from 'node:fs/promises'
import path from 'node:path'
import type { JobContext } from './index.js'

type FilePayload = {
  server_id?: string
  installPath?: string
  install_path?: string
  relativePath?: string
  content?: string
}

const editableExtensions = new Set(['.xml', '.json', '.cfg', '.ini', '.txt', '.log'])

function readPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Missing file manager payload')
  const input = payload as FilePayload
  const serverId = input.server_id
  const installPath = input.installPath || input.install_path
  const relativePath = input.relativePath || ''
  if (!serverId) throw new Error('Missing server_id')
  if (!installPath) throw new Error('Missing installPath')
  return { serverId, installPath, relativePath, content: input.content ?? '' }
}

function safeServerRoot(installPath: string) {
  const root = path.resolve(process.env.APEXGSP_SERVERS_ROOT || '/opt/apexgsp/servers')
  const resolved = path.resolve(installPath)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe install path: ${resolved}`)
  return resolved
}

function safeTarget(root: string, relativePath: string) {
  const cleaned = relativePath.replace(/^\/+/, '')
  const target = path.resolve(root, cleaned)
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error('Unsafe file path')
  return target
}

function toRelative(root: string, target: string) {
  const rel = path.relative(root, target)
  return rel === '' ? '' : rel.split(path.sep).join('/')
}

async function entryInfo(root: string, target: string) {
  const stat = await fs.stat(target)
  return {
    name: path.basename(target),
    path: toRelative(root, target),
    type: stat.isDirectory() ? 'directory' : 'file',
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
  }
}

export async function listFiles(payload: unknown, ctx?: JobContext) {
  const input = readPayload(payload)
  const root = safeServerRoot(input.installPath)
  const dir = safeTarget(root, input.relativePath)

  await ctx?.reportProgress({ progress: 25, message: 'Listing files', serverId: input.serverId })

  const stat = await fs.stat(dir)
  if (!stat.isDirectory()) throw new Error('Path is not a folder')

  const names = await fs.readdir(dir)
  const entries = await Promise.all(names.map(name => entryInfo(root, path.join(dir, name))))
  entries.sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1)

  return { message: 'Files loaded', serverId: input.serverId, status: 'files_loaded', currentPath: toRelative(root, dir), entries }
}

export async function readFile(payload: unknown, ctx?: JobContext) {
  const input = readPayload(payload)
  const root = safeServerRoot(input.installPath)
  const file = safeTarget(root, input.relativePath)
  const ext = path.extname(file).toLowerCase()

  await ctx?.reportProgress({ progress: 30, message: 'Reading file', serverId: input.serverId })

  if (!editableExtensions.has(ext)) throw new Error(`File type ${ext || '(none)'} is not editable`)
  const stat = await fs.stat(file)
  if (!stat.isFile()) throw new Error('Path is not a file')
  if (stat.size > 1024 * 1024) throw new Error('File is too large to edit')

  const content = await fs.readFile(file, 'utf8')
  return { message: 'File loaded', serverId: input.serverId, status: 'file_loaded', path: toRelative(root, file), content, size: stat.size }
}

export async function writeFile(payload: unknown, ctx?: JobContext) {
  const input = readPayload(payload)
  const root = safeServerRoot(input.installPath)
  const file = safeTarget(root, input.relativePath)
  const ext = path.extname(file).toLowerCase()

  await ctx?.reportProgress({ progress: 30, message: 'Saving file', serverId: input.serverId })

  if (!editableExtensions.has(ext)) throw new Error(`File type ${ext || '(none)'} is not editable`)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, input.content, 'utf8')

  return { message: 'File saved', serverId: input.serverId, status: 'file_saved', path: toRelative(root, file) }
}

export async function createFolder(payload: unknown, ctx?: JobContext) {
  const input = readPayload(payload)
  const root = safeServerRoot(input.installPath)
  const folder = safeTarget(root, input.relativePath)

  await ctx?.reportProgress({ progress: 50, message: 'Creating folder', serverId: input.serverId })
  await fs.mkdir(folder, { recursive: true })

  return { message: 'Folder created', serverId: input.serverId, status: 'folder_created', path: toRelative(root, folder) }
}

export async function deletePath(payload: unknown, ctx?: JobContext) {
  const input = readPayload(payload)
  const root = safeServerRoot(input.installPath)
  const target = safeTarget(root, input.relativePath)

  if (target === root) throw new Error('Cannot delete server root')
  await ctx?.reportProgress({ progress: 50, message: 'Deleting path', serverId: input.serverId })
  await fs.rm(target, { recursive: true, force: true })

  return { message: 'Path deleted', serverId: input.serverId, status: 'path_deleted', path: toRelative(root, target) }
}
