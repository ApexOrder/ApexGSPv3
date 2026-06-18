import fs from 'node:fs/promises'
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

async function stopPid(pid: number) {
  await runCommand('kill', [String(pid)])

  for (let i = 0; i < 12; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000))
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

  const pid = await readPid(pidFile)
  if (!pid) {
    await fs.rm(pidFile, { force: true })
    return { message: 'Server is stopped', serverId: input.server_id, status: 'stopped', pid: null }
  }

  const running = await isProcessRunning(pid)
  if (!running) {
    await fs.rm(pidFile, { force: true })
    return { message: 'Server process is not running', serverId: input.server_id, status: 'stopped', pid: null }
  }

  await ctx?.reportProgress({ progress: 100, message: 'Server is running', serverId: input.server_id, pid })
  return { message: 'Server is running', serverId: input.server_id, status: 'running', pid }
}

export async function startServer(payload: unknown, ctx?: JobContext) {
  const input = readPayload(payload)
  const installPath = resolveInstallPath(input.installPath)
  const pidFile = path.join(installPath, '.apexgsp.pid')
  const logFile = path.join(installPath, 'Logs', 'server.log')

  await ctx?.reportProgress({ progress: 10, message: 'Preparing to start server', serverId: input.server_id })

  const existingPid = await readPid(pidFile)
  if (existingPid && await isProcessRunning(existingPid)) {
    await ctx?.reportProgress({ progress: 100, message: 'Server is already running', serverId: input.server_id, pid: existingPid })
    return { message: 'Server is already running', serverId: input.server_id, status: 'running', pid: existingPid }
  }

  const executable = await findExecutable(installPath, input.executablePath || input.executable_path)
  if (!executable) throw new Error(`Server executable not found in ${installPath}`)

  await fs.mkdir(path.join(installPath, 'Logs'), { recursive: true })
  const logHandle = await fs.open(logFile, 'a')

  await ctx?.reportProgress({ progress: 40, message: 'Starting server process', serverId: input.server_id })

  const child = spawn(executable, ['-quit', '-batchmode', '-nographics', '-dedicated'], {
    cwd: installPath,
    detached: true,
    stdio: ['ignore', logHandle.fd, logHandle.fd],
  })

  child.unref()
  await fs.writeFile(pidFile, String(child.pid ?? ''), 'utf8')
  await logHandle.close()

  await ctx?.reportProgress({ progress: 100, message: 'Server start requested', serverId: input.server_id, pid: child.pid })
  return { message: 'Server start requested', serverId: input.server_id, status: 'running', pid: child.pid, logFile }
}

export async function stopServer(payload: unknown, ctx?: JobContext) {
  const input = readPayload(payload)
  const installPath = resolveInstallPath(input.installPath)
  const pidFile = path.join(installPath, '.apexgsp.pid')

  await ctx?.reportProgress({ progress: 20, message: 'Stopping server', serverId: input.server_id })

  const pid = await readPid(pidFile)
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
