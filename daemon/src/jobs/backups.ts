import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { JobContext } from './index.js'

type BackupMode = 'full' | 'world'

type BackupPayload = {
  server_id?: string
  installPath?: string
  install_path?: string
  backupName?: string
  backupFile?: string
  backupMode?: BackupMode
}

function readPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Missing backup payload')
  const input = payload as BackupPayload
  const serverId = input.server_id
  const installPath = input.installPath || input.install_path
  if (!serverId) throw new Error('Missing server_id')
  if (!installPath) throw new Error('Missing installPath')
  return { serverId, installPath, backupName: input.backupName, backupFile: input.backupFile, backupMode: input.backupMode === 'world' ? 'world' as BackupMode : 'full' as BackupMode }
}

function safeServerRoot(value: string) {
  const root = path.resolve(process.env.APEXGSP_SERVERS_ROOT || '/opt/apexgsp/servers')
  const resolved = path.resolve(value)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe install path: ${resolved}`)
  return resolved
}

function backupRoot(serverId: string) {
  const root = path.resolve(process.env.APEXGSP_BACKUPS_ROOT || '/opt/apexgsp/backups')
  return path.join(root, serverId)
}

function safeBackupPath(serverId: string, fileName: string) {
  if (!fileName.endsWith('.tar.gz') && !fileName.endsWith('.tar.gz.partial')) throw new Error('Invalid backup file')
  if (fileName.includes('/') || fileName.includes('\\')) throw new Error('Invalid backup file')
  const root = backupRoot(serverId)
  const resolved = path.resolve(root, fileName)
  if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('Unsafe backup path')
  return resolved
}

function cleanName(value?: string) {
  const base = value?.trim() || `backup-${new Date().toISOString().replaceAll(':', '-')}`
  return base.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 80)
}

function modeFromName(name: string) {
  if (name.includes('-world-') || name.startsWith('world-')) return 'world'
  if (name.includes('-full-') || name.startsWith('full-')) return 'full'
  return 'full'
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function listBackupEntries(serverId: string) {
  const root = backupRoot(serverId)
  await fs.mkdir(root, { recursive: true })
  const names = await fs.readdir(root)
  const files = []

  for (const name of names) {
    if (!name.endsWith('.tar.gz') && !name.endsWith('.tar.gz.partial')) continue
    const filePath = safeBackupPath(serverId, name)
    const stat = await fs.stat(filePath)
    const isPartial = name.endsWith('.partial')
    const displayName = isPartial ? name.replace(/\.partial$/, '') : name

    files.push({
      name,
      displayName,
      path: filePath,
      size: stat.size,
      createdAt: stat.birthtime.toISOString(),
      modifiedAt: stat.mtime.toISOString(),
      status: isPartial ? 'creating' : 'ready',
      mode: modeFromName(displayName),
    })
  }

  files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
  return files
}

function buildTarArgs(mode: BackupMode, outputPath: string, serverRoot: string) {
  if (mode === 'world') {
    return [
      '-czf', outputPath,
      '-C', serverRoot,
      '--ignore-failed-read',
      'serverconfig.xml',
      'serveradmin.xml',
      'Mods',
      'Saves',
      'Data/Worlds',
    ]
  }

  return [
    '-czf', outputPath,
    '-C', serverRoot,
    '--exclude=./Logs',
    '--exclude=./logs',
    '--exclude=*.log',
    '--exclude=*.dmp',
    '--exclude=*.tmp',
    '.',
  ]
}

export async function listBackups(payload: unknown, ctx?: JobContext) {
  const input = readPayload(payload)
  await ctx?.reportProgress({ progress: 50, message: 'Listing backups', serverId: input.serverId })
  const backups = await listBackupEntries(input.serverId)
  const creating = backups.some(backup => backup.status === 'creating')
  return { message: creating ? 'Backup is still being created' : 'Backups loaded', serverId: input.serverId, status: creating ? 'backup_creating' : 'backups_loaded', backups, creating }
}

export async function createBackup(payload: unknown, ctx?: JobContext) {
  const input = readPayload(payload)
  const serverRoot = safeServerRoot(input.installPath)
  const root = backupRoot(input.serverId)
  await fs.mkdir(root, { recursive: true })

  const prefix = input.backupMode === 'world' ? 'world' : 'full'
  const name = `${prefix}-${cleanName(input.backupName)}.tar.gz`
  const finalPath = safeBackupPath(input.serverId, name)
  const partialName = `${name}.partial`
  const partialPath = safeBackupPath(input.serverId, partialName)

  if (await exists(finalPath) || await exists(partialPath)) throw new Error(`Backup already exists: ${name}`)

  await ctx?.reportProgress({ progress: 20, message: 'Starting backup archive', serverId: input.serverId, backupFile: name, backupMode: input.backupMode })

  const child = spawn('tar', buildTarArgs(input.backupMode, partialPath, serverRoot), {
    detached: true,
    stdio: 'ignore',
  })

  child.unref()

  void (async () => {
    await new Promise<void>(resolve => child.once('exit', () => resolve()))
    try {
      if (child.exitCode === 0 && await exists(partialPath)) {
        await fs.rename(partialPath, finalPath)
      } else {
        await fs.rm(partialPath, { force: true })
      }
    } catch {
      await fs.rm(partialPath, { force: true }).catch(() => undefined)
    }
  })()

  return {
    message: `${input.backupMode === 'world' ? 'World' : 'Full'} backup creation started`,
    serverId: input.serverId,
    status: 'backup_started',
    creating: true,
    backup: { name: partialName, displayName: name, path: partialPath, partialName, partialPath, size: 0, modifiedAt: new Date().toISOString(), status: 'creating', mode: input.backupMode },
  }
}

export async function deleteBackup(payload: unknown, ctx?: JobContext) {
  const input = readPayload(payload)
  if (!input.backupFile) throw new Error('Missing backupFile')
  const filePath = safeBackupPath(input.serverId, input.backupFile)

  await ctx?.reportProgress({ progress: 50, message: 'Deleting backup', serverId: input.serverId, backupFile: input.backupFile })
  await fs.rm(filePath, { force: true })

  return { message: 'Backup deleted', serverId: input.serverId, status: 'backup_deleted', backupFile: input.backupFile }
}
