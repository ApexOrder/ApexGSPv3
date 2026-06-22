import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { JobContext } from './index.js'
import { refreshServerStatus, startServer, stopServer } from './manageServer.js'

type BackupMode = 'full' | 'world'

type BackupPayload = {
  server_id?: string
  installPath?: string
  install_path?: string
  backupName?: string
  backupFile?: string
  backupMode?: BackupMode
  restartAfterRestore?: boolean
}

type TarEntry = {
  name: string
  type: string
}

function readPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Missing backup payload')
  const input = payload as BackupPayload
  const serverId = input.server_id
  const installPath = input.installPath || input.install_path
  if (!serverId) throw new Error('Missing server_id')
  if (!installPath) throw new Error('Missing installPath')
  return {
    serverId,
    installPath,
    backupName: input.backupName,
    backupFile: input.backupFile,
    backupMode: input.backupMode === 'world' ? 'world' as BackupMode : 'full' as BackupMode,
    restartAfterRestore: input.restartAfterRestore !== false,
  }
}

function serversRoot() {
  return path.resolve(process.env.APEXGSP_SERVERS_ROOT || '/opt/apexgsp/servers')
}

function safeServerRoot(value: string) {
  const root = serversRoot()
  const resolved = path.resolve(value)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe install path: ${resolved}`)
  return resolved
}

function safeRestoreRoot(value: string) {
  const resolved = safeServerRoot(value)
  if (resolved === serversRoot()) throw new Error('Refusing to restore directly into the servers root')
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

function restoreLockPath(serverId: string) {
  return path.join(backupRoot(serverId), '.restore.lock')
}

function cleanName(value?: string) {
  const base = value?.trim() || `backup-${new Date().toISOString().replaceAll(':', '-')}`
  return base.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 80)
}

function modeFromName(name: string) {
  if (name.includes('-world-') || name.startsWith('world-')) return 'world'
  if (name.includes('-full-') || name.startsWith('full-')) return 'full'
  if (name.includes('pre-restore-world')) return 'world'
  if (name.includes('pre-restore-full')) return 'full'
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

function runProcess(command: string, args: string[], options: { cwd?: string } = {}) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', chunk => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })

    child.once('error', reject)
    child.once('exit', code => {
      if (code === 0) return resolve({ stdout, stderr })
      reject(new Error(stderr.trim() || `${command} exited with code ${code}`))
    })
  })
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
      id: displayName,
      name,
      displayName,
      path: filePath,
      size: stat.size,
      createdAt: stat.birthtime.toISOString(),
      modifiedAt: stat.mtime.toISOString(),
      status: isPartial ? 'creating' : 'ready',
      mode: modeFromName(displayName),
      serverId,
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

async function createSafetyBackup(serverId: string, serverRoot: string, mode: BackupMode, ctx?: JobContext) {
  const root = backupRoot(serverId)
  await fs.mkdir(root, { recursive: true })

  const name = `pre-restore-${mode}-${new Date().toISOString().replaceAll(':', '-')}.tar.gz`
  const finalPath = safeBackupPath(serverId, name)
  const partialPath = safeBackupPath(serverId, `${name}.partial`)

  await ctx?.reportProgress({ progress: 25, message: 'Creating pre-restore safety backup', serverId, backupFile: name, backupMode: mode })
  await runProcess('tar', buildTarArgs(mode, partialPath, serverRoot))
  await fs.rename(partialPath, finalPath)

  return { name, path: finalPath }
}

function validateTarEntry(entryName: string) {
  const name = entryName.trim()
  if (!name || name === '.') return
  if (path.isAbsolute(name)) throw new Error(`Unsafe absolute archive path: ${name}`)
  if (name.includes('\0')) throw new Error('Unsafe archive path contains null byte')
  const normal = path.posix.normalize(name.replaceAll('\\', '/'))
  if (normal === '..' || normal.startsWith('../') || normal.includes('/../')) throw new Error(`Unsafe archive traversal path: ${name}`)
}

function parseTarTable(output: string): TarEntry[] {
  return output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const type = line[0] || '?'
      const parts = line.split(/\s+/)
      const rawName = parts.slice(5).join(' ')
      const name = rawName.includes(' -> ') ? rawName.split(' -> ')[0] : rawName
      return { type, name }
    })
}

async function validateBackupArchive(serverId: string, backupFile: string, expectedMode: BackupMode) {
  const backupPath = safeBackupPath(serverId, backupFile)
  if (backupFile.endsWith('.partial')) throw new Error('Cannot restore a backup that is still being created')
  if (!(await exists(backupPath))) throw new Error(`Backup not found: ${backupFile}`)

  const { stdout } = await runProcess('tar', ['-tzvf', backupPath])
  const entries = parseTarTable(stdout)

  if (entries.length === 0) throw new Error('Backup archive is empty')
  for (const entry of entries) {
    validateTarEntry(entry.name)
    if (entry.type === 'l') throw new Error(`Refusing to restore archive containing symlink: ${entry.name}`)
  }

  const inferredMode = modeFromName(backupFile)
  if (inferredMode !== expectedMode) throw new Error(`Backup type mismatch: expected ${expectedMode}, got ${inferredMode}`)

  return { backupPath, entries }
}

async function assertNoBackupInProgress(serverId: string) {
  const backups = await listBackupEntries(serverId)
  if (backups.some(backup => backup.status === 'creating')) throw new Error('A backup is already running for this server')
}

async function withRestoreLock<T>(serverId: string, action: () => Promise<T>) {
  const root = backupRoot(serverId)
  await fs.mkdir(root, { recursive: true })
  const lockPath = restoreLockPath(serverId)
  const handle = await fs.open(lockPath, 'wx').catch(() => null)

  if (!handle) throw new Error('A restore is already running for this server')

  try {
    await handle.writeFile(JSON.stringify({ serverId, startedAt: new Date().toISOString() }))
    await handle.close()
    return await action()
  } finally {
    await fs.rm(lockPath, { force: true }).catch(() => undefined)
  }
}

async function replaceFullServerRoot(serverRoot: string, extractedRoot: string) {
  const tempOldRoot = `${serverRoot}.pre-restore-${Date.now()}`
  await fs.rename(serverRoot, tempOldRoot)
  try {
    await fs.mkdir(serverRoot, { recursive: true })
    await fs.cp(extractedRoot, serverRoot, { recursive: true, force: true })
    await fs.rm(tempOldRoot, { recursive: true, force: true })
  } catch (error) {
    await fs.rm(serverRoot, { recursive: true, force: true }).catch(() => undefined)
    if (await exists(tempOldRoot)) await fs.rename(tempOldRoot, serverRoot).catch(() => undefined)
    throw error
  }
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
  if (await exists(restoreLockPath(input.serverId))) throw new Error('Cannot start backup while restore is running')

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
    backup: { id: name, name: partialName, displayName: name, path: partialPath, partialName, partialPath, size: 0, modifiedAt: new Date().toISOString(), status: 'creating', mode: input.backupMode, serverId: input.serverId },
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

export async function restoreBackup(payload: unknown, ctx?: JobContext) {
  const input = readPayload(payload)
  if (!input.backupFile) throw new Error('Missing backupFile')

  const mode = input.backupMode
  const serverRoot = safeRestoreRoot(input.installPath)

  return withRestoreLock(input.serverId, async () => {
    await assertNoBackupInProgress(input.serverId)

    await ctx?.reportProgress({ progress: 10, message: 'Validating backup archive', serverId: input.serverId, backupFile: input.backupFile, backupMode: mode })
    const { backupPath } = await validateBackupArchive(input.serverId, input.backupFile as string, mode)

    const status = await refreshServerStatus({ server_id: input.serverId, installPath: serverRoot })
    const wasRunning = status.status === 'running'

    const safetyBackup = await createSafetyBackup(input.serverId, serverRoot, mode, ctx)

    if (wasRunning) {
      await ctx?.reportProgress({ progress: 40, message: 'Stopping server before restore', serverId: input.serverId })
      await stopServer({ server_id: input.serverId, installPath: serverRoot }, ctx)
    }

    const tempRoot = path.join(backupRoot(input.serverId), `.restore-${Date.now()}`)
    await fs.rm(tempRoot, { recursive: true, force: true })
    await fs.mkdir(tempRoot, { recursive: true })

    try {
      await ctx?.reportProgress({ progress: 55, message: 'Extracting backup into staging area', serverId: input.serverId, backupFile: input.backupFile })
      await runProcess('tar', ['-xzf', backupPath, '-C', tempRoot])

      if (mode === 'full') {
        await ctx?.reportProgress({ progress: 75, message: 'Replacing full server files', serverId: input.serverId })
        await replaceFullServerRoot(serverRoot, tempRoot)
      } else {
        await ctx?.reportProgress({ progress: 75, message: 'Restoring world files', serverId: input.serverId })
        await fs.cp(tempRoot, serverRoot, { recursive: true, force: true })
      }

      await ctx?.reportProgress({ progress: 88, message: 'Restore files applied', serverId: input.serverId })

      if (wasRunning && input.restartAfterRestore) {
        await ctx?.reportProgress({ progress: 92, message: 'Restarting server after restore', serverId: input.serverId })
        await startServer({ server_id: input.serverId, installPath: serverRoot }, ctx)
      }

      await ctx?.reportProgress({ progress: 100, message: 'Restore complete', serverId: input.serverId, backupFile: input.backupFile, backupMode: mode })
      return {
        message: `${mode === 'world' ? 'World' : 'Full'} backup restored`,
        serverId: input.serverId,
        status: 'restore_complete',
        backupFile: input.backupFile,
        backupMode: mode,
        safetyBackup,
        restarted: wasRunning && input.restartAfterRestore,
      }
    } catch (error) {
      await ctx?.reportProgress({ progress: 100, message: `Restore failed: ${(error as Error).message}`, serverId: input.serverId, backupFile: input.backupFile, backupMode: mode })
      throw error
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined)
    }
  })
}
