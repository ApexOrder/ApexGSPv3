import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { runCommand } from '../utils/exec.js'

type MetricsPayload = {
  server_id?: string
  installPath?: string
  install_path?: string
}

function getPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Missing metrics payload')
  const input = payload as MetricsPayload
  const serverId = input.server_id
  const installPath = input.installPath || input.install_path
  if (!serverId) throw new Error('Missing server_id')
  if (!installPath) throw new Error('Missing installPath')
  return { serverId, installPath }
}

function safePath(value: string) {
  const root = path.resolve(process.env.APEXGSP_SERVERS_ROOT || '/opt/apexgsp/servers')
  const resolved = path.resolve(value)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe install path: ${resolved}`)
  return resolved
}

async function readPid(installPath: string) {
  try {
    const value = await fs.readFile(path.join(installPath, '.apexgsp.pid'), 'utf8')
    const pid = Number(value.trim())
    return Number.isFinite(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

async function isRunning(pid: number) {
  const result = await runCommand('kill', ['-0', String(pid)])
  return result.ok
}

async function find7dtdPid(installPath: string) {
  const result = await runCommand('pgrep', ['-f', `${installPath}.+7DaysToDieServer`])
  if (!result.ok) return null
  const pid = Number(result.stdout.trim().split(/\s+/)[0])
  return Number.isFinite(pid) && pid > 0 ? pid : null
}

async function getPid(installPath: string) {
  const pid = await readPid(installPath)
  if (pid && await isRunning(pid)) return pid
  return find7dtdPid(installPath)
}

async function getProcessMetrics(pid: number | null) {
  if (!pid) return null
  const result = await runCommand('ps', ['-p', String(pid), '-o', 'pid=,pcpu=,rss=,etimes=,comm='])
  if (!result.ok || !result.stdout.trim()) return null

  const parts = result.stdout.trim().split(/\s+/)
  const parsedPid = Number(parts[0])
  const cpuPercent = Number(parts[1])
  const rssKb = Number(parts[2])
  const uptimeSeconds = Number(parts[3])
  const command = parts.slice(4).join(' ')

  return {
    pid: parsedPid,
    cpuPercent: Number.isFinite(cpuPercent) ? cpuPercent : 0,
    memoryBytes: Number.isFinite(rssKb) ? rssKb * 1024 : 0,
    uptimeSeconds: Number.isFinite(uptimeSeconds) ? uptimeSeconds : 0,
    command,
  }
}

async function getDiskUsage(installPath: string) {
  const result = await runCommand('du', ['-sb', installPath])
  if (!result.ok) return null
  const bytes = Number(result.stdout.trim().split(/\s+/)[0])
  return Number.isFinite(bytes) ? bytes : null
}

async function getDiskFree(installPath: string) {
  const result = await runCommand('df', ['-B1', installPath])
  if (!result.ok) return null
  const lines = result.stdout.trim().split(/\r?\n/)
  const parts = lines[1]?.trim().split(/\s+/)
  if (!parts || parts.length < 5) return null
  return {
    filesystem: parts[0],
    totalBytes: Number(parts[1]) || 0,
    usedBytes: Number(parts[2]) || 0,
    freeBytes: Number(parts[3]) || 0,
    usedPercent: Number(String(parts[4]).replace('%', '')) || 0,
  }
}

export async function getServerMetrics(payload: unknown) {
  const input = getPayload(payload)
  const installPath = safePath(input.installPath)
  const pid = await getPid(installPath)
  const process = await getProcessMetrics(pid)
  const installSizeBytes = await getDiskUsage(installPath)
  const disk = await getDiskFree(installPath)

  return {
    message: process ? 'Metrics loaded' : 'Server is stopped',
    serverId: input.serverId,
    status: process ? 'running' : 'stopped',
    pid: process?.pid ?? null,
    cpuPercent: process?.cpuPercent ?? 0,
    memoryBytes: process?.memoryBytes ?? 0,
    uptimeSeconds: process?.uptimeSeconds ?? 0,
    command: process?.command ?? null,
    installSizeBytes,
    disk,
    host: {
      loadAverage: os.loadavg(),
      totalMemoryBytes: os.totalmem(),
      freeMemoryBytes: os.freemem(),
    },
    collectedAt: new Date().toISOString(),
  }
}
