import fs from 'node:fs/promises'
import path from 'node:path'
import type { JobContext } from './index.js'

type ConsolePayload = {
  server_id?: string
  installPath?: string
  install_path?: string
  lines?: number
}

function getPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Missing console payload')
  const input = payload as ConsolePayload
  const serverId = input.server_id
  const installPath = input.installPath || input.install_path
  if (!serverId) throw new Error('Missing server_id')
  if (!installPath) throw new Error('Missing installPath')
  return { serverId, installPath, lines: input.lines }
}

function safePath(value: string) {
  const root = path.resolve(process.env.APEXGSP_SERVERS_ROOT || '/opt/apexgsp/servers')
  const resolved = path.resolve(value)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe install path: ${resolved}`)
  return resolved
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function latestLogFile(installPath: string) {
  const apexCurrentRunLog = path.join(installPath, 'Logs', 'apexgsp-server.log')
  if (await exists(apexCurrentRunLog)) return apexCurrentRunLog

  const logsDir = path.join(installPath, 'Logs')
  try {
    const entries = await fs.readdir(logsDir, { withFileTypes: true })
    const files: Array<{ filePath: string; mtimeMs: number }> = []

    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (!entry.name.endsWith('.log') && !entry.name.endsWith('.txt')) continue
      const filePath = path.join(logsDir, entry.name)
      const stat = await fs.stat(filePath)
      files.push({ filePath, mtimeMs: stat.mtimeMs })
    }

    files.sort((a, b) => b.mtimeMs - a.mtimeMs)
    return files[0]?.filePath ?? null
  } catch {
    return null
  }
}

function takeLastLines(value: string, count: number) {
  return value.split(/\r?\n/).slice(-count).join('\n')
}

export async function getServerLogs(payload: unknown, ctx?: JobContext) {
  const input = getPayload(payload)
  const installPath = safePath(input.installPath)
  const lineCount = Math.min(500, Math.max(25, Number(input.lines || 150)))

  await ctx?.reportProgress({ progress: 25, message: 'Finding console log', serverId: input.serverId })

  const logFile = await latestLogFile(installPath)
  if (!logFile) {
    return {
      message: 'No console log found yet',
      serverId: input.serverId,
      status: 'logs_unavailable',
      lines: '',
      logFile: null,
    }
  }

  await ctx?.reportProgress({ progress: 75, message: 'Reading console log', serverId: input.serverId, logFile })

  const text = await fs.readFile(logFile, 'utf8')
  const lines = takeLastLines(text, lineCount)

  return {
    message: `Console log loaded from ${path.basename(logFile)}`,
    serverId: input.serverId,
    status: 'logs_loaded',
    lines,
    logFile,
  }
}
