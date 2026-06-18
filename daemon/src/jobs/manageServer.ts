import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { runCommand } from '../utils/exec.js'
import type { JobContext } from './index.js'

type ServerJobPayload = {
  server_id?: string
  name?: string
  slug?: string
  game?: string
  installPath?: string
  install_path?: string
  executablePath?: string | null
  executable_path?: string | null
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function readPayload(payload: unknown): Required<Pick<ServerJobPayload, 'server_id' | 'installPath'>> & ServerJobPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Missing server job payload')
  }

  const input = payload as ServerJobPayload
  const server_id = input.server_id
  const installPath = input.installPath || input.install_path

  if (!server_id) throw new Error('Missing server_id')
  if (!installPath) throw new Error('Missing installPath')

  return { ...input, server_id, installPath }
}

function resolveInstallPath(installPath: string) {
  const root = path.resolve(process.env.APEXGSP_SERVERS_ROOT || '/opt/apexgsp/servers')
  const resolved = path.resolve(installPath)

  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Unsafe install path: ${resolved}`)
  }

  return resolved
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function findExecutable(installPath: string, payloadExecutable?: string | null) {
  const candidates = [
    payloadExecutable,
    path.join(installPath, '7DaysToDieServer.x86_64'),
    path.join(installPath, '7DaysToDieServer.x86'),
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate)
    if (resolved.startsWith(`${installPath}${path.sep}`) && await pathExists(resolved)) return resolved
  }

  return null
}

async function readPid(pidFile: string) {
  try {
    const value = await fs.readFile(pidFile, 'utf8')
    const pid = Number(value.trim())
    return Number.isFinite(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

async function isProcessRunning(pid: number) {
  const result = await runCommand('kill', ['-0', String(pid)])
  return result.ok
}

async function find7dtdPid(installPath: string) {
  const result = await runCommand('pgrep', ['-f', `${installPath}.+7DaysToDieServer`])
  if (!result.ok) return null
  const pid = Number(result.stdout.trim().split(/\s+/)[0])
  return Number.isFinite(pid) && pid > 0 ? pid : null
}

async function getTail(filePath: string, lines = 40) {
  try {
    const result = await runCommand('tail', ['-n', String(lines), filePath])
    return result.stdout || result.stderr || ''
  } catch {
    return ''
  }
}

async function stopPid(pid: number) {
  await runCommand('kill', [String(pid)])

  for (let i = 0; i < 12; i++) {
    await sleep(1000)
    if (!(await isProcessRunning(pid))) return true
  }

  await runCommand('kill', ['-9', String(pid)])
  return !(await isProcessRunning(pid))
}

export async function refreshServerStatus(payload: unknown, ctx?: JobContext) {
  const input = readPayload(payload)
  const installPath = resolveInstallPath(input.installPath)
  const pidFile = path.join(installPath, '.apexgsp.pid')

  await ctx?.reportProgress({ progress: 35, message: 'Checking server process', serverId: input.server_id })

  let pid = await readPid(pidFile)
  if (pid && await isProcessRunning(pid)) {
    await ctx?.reportProgress({ progress: 100, message: 'Server is running', serverId: input.server_id, pid })
    return { message: 'Server is running', serverId: input.server_id, status: 'running', pid }
  }

  pid = await find7dtdPid(installPath)
  if (pid) {
    await fs.writeFile(pidFile, String(pid), 'utf8')
    await ctx?.reportProgress({ progress: 100, message: 'Server is running', serverId: input.server_id, pid })
    return { message: 'Server is running', serverId: input.server_id, status: 'running', pid }
  }

  await fs.rm(pidFile, { force: true })
  return { message: 'Server process is not running', serverId: input.server_id, status: 'stopped', pid: null }
}

export async function startServer(payload: unknown, ctx?: JobContext) {
  const input = readPayload(payload)
  const installPath = resolveInstallPath(input.installPath)
  const pidFile = path.join(installPath, '.apexgsp.pid')
  const logDir = path.join(installPath, 'Logs')
  const logFile = path.join(logDir, 'apexgsp-server.log')

  await ctx?.reportProgress({ progress: 10, message: 'Preparing to start server', serverId: input.server_id })

  const currentStatus = await refreshServerStatus(payload)
  if (currentStatus.status === 'running') {
    await ctx?.reportProgress({ progress: 100, message: 'Server is already running', serverId: input.server_id, pid: currentStatus.pid })
    return currentStatus
  }

  const executable = await findExecutable(installPath, input.executablePath || input.executable_path)
  if (!executable) throw new Error(`Server executable not found in ${installPath}`)

  await fs.mkdir(logDir, { recursive: true })

  await ctx?.reportProgress({ progress: 35, message: 'Starting server process', serverId: input.server_id })

  const out = fsSync.openSync(logFile, 'a')
  const err = fsSync.openSync(logFile, 'a')

  const child = spawn(executable, ['-quit', '-batchmode', '-nographics', '-configfile=serverconfig.xml'], {
    cwd: installPath,
    detached: true,
    stdio: ['ignore', out, err],
    env: {
      ...process.env,
      LD_LIBRARY_PATH: installPath,
    },
  })

  child.unref()
  fsSync.closeSync(out)
  fsSync.closeSync(err)

  if (!child.pid) throw new Error('Failed to obtain server PID')

  await fs.writeFile(pidFile, String(child.pid), 'utf8')
  await ctx?.reportProgress({ progress: 60, message: 'Waiting for server process to remain alive', serverId: input.server_id, pid: child.pid })

  await sleep(8000)

  let runningPid = child.pid
  if (!(await isProcessRunning(runningPid))) {
    const discovered = await find7dtdPid(installPath)
    if (discovered) runningPid = discovered
  }

  if (!(await isProcessRunning(runningPid))) {
    await fs.rm(pidFile, { force: true })
    const logTail = await getTail(logFile)
    return { message: 'Server failed to stay running', serverId: input.server_id, status: 'error', pid: null, logFile, logTail }
  }

  await fs.writeFile(pidFile, String(runningPid), 'utf8')
  await ctx?.reportProgress({ progress: 100, message: 'Server is running', serverId: input.server_id, pid: runningPid })
  return { message: 'Server is running', serverId: input.server_id, status: 'running', pid: runningPid, logFile }
}

export async function stopServer(payload: unknown, ctx?: JobContext) {
  const input = readPayload(payload)
  const installPath = resolveInstallPath(input.installPath)
  const pidFile = path.join(installPath, '.apexgsp.pid')

  await ctx?.reportProgress({ progress: 20, message: 'Stopping server', serverId: input.server_id })

  let pid = await readPid(pidFile)
  if (!pid || !(await isProcessRunning(pid))) pid = await find7dtdPid(installPath)

  if (!pid || !(await isProcessRunning(pid))) {
    await fs.rm(pidFile, { force: true })
    await ctx?.reportProgress({ progress: 100, message: 'Server is already stopped', serverId: input.server_id })
    return { message: 'Server is already stopped', serverId: input.server_id, status: 'stopped' }
  }

  const stopped = await stopPid(pid)
  await fs.rm(pidFile, { force: true })

  if (!stopped) throw new Error(`Failed to stop server process ${pid}`)

  await ctx?.reportProgress({ progress: 100, message: 'Server stopped', serverId: input.server_id })
  return { message: 'Server stopped', serverId: input.server_id, status: 'stopped' }
}

export async function restartServer(payload: unknown, ctx?: JobContext) {
  await ctx?.reportProgress({ progress: 10, message: 'Restarting server' })
  await stopServer(payload, ctx)
  await ctx?.reportProgress({ progress: 55, message: 'Starting server again' })
  return startServer(payload, ctx)
}
