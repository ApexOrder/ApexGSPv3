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
  settings?: Record<string, unknown> | null
  ports?: Record<string, unknown> | null
}

type RuntimeProfile = {
  game: string
  executableNames: string[]
  command: 'native' | 'wine'
  args: (input: ServerJobPayload) => string[]
  processPattern: string
}

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)) }
function gameId(value?: string) { return String(value || '7dtd').toLowerCase() }
function numberValue(value: unknown, fallback: number) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback }
function payloadPort(input: ServerJobPayload, fallback: number) { return numberValue(input.settings?.serverPort ?? input.ports?.game, fallback) }

function runtimeProfile(game?: string): RuntimeProfile {
  const id = gameId(game)
  if (id === 'dayz') return {
    game: 'dayz',
    executableNames: ['DayZServer_x64.exe', 'DayZServer.exe'],
    command: 'wine',
    args: input => ['-config=serverDZ.cfg', '-profiles=profiles', `-port=${payloadPort(input, 2302)}`, '-dologs', '-adminlog', '-netlog', '-freezecheck'],
    processPattern: 'DayZServer',
  }
  return {
    game: '7dtd',
    executableNames: ['7DaysToDieServer.x86_64', '7DaysToDieServer.x86'],
    command: 'native',
    args: () => ['-quit', '-batchmode', '-nographics', '-configfile=serverconfig.xml'],
    processPattern: '7DaysToDieServer',
  }
}

function readPayload(payload: unknown): Required<Pick<ServerJobPayload, 'server_id' | 'installPath'>> & ServerJobPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Missing server job payload')
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
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe install path: ${resolved}`)
  return resolved
}

async function pathExists(filePath: string) { try { await fs.access(filePath); return true } catch { return false } }

async function findExecutable(installPath: string, profile: RuntimeProfile, payloadExecutable?: string | null) {
  const candidates = [payloadExecutable, ...profile.executableNames.map(name => path.join(installPath, name))].filter(Boolean) as string[]
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate)
    if (resolved.startsWith(`${installPath}${path.sep}`) && await pathExists(resolved)) return resolved
  }
  return null
}

async function findTool(command: string, candidates: string[]) {
  const which = await runCommand('which', [command])
  if (which.ok && which.stdout) return which.stdout.split('\n')[0]
  for (const candidate of candidates) { const exists = await runCommand('test', ['-x', candidate]); if (exists.ok) return candidate }
  return null
}

async function readPid(pidFile: string) { try { const value = await fs.readFile(pidFile, 'utf8'); const pid = Number(value.trim()); return Number.isFinite(pid) && pid > 0 ? pid : null } catch { return null } }
async function isProcessRunning(pid: number) { const result = await runCommand('kill', ['-0', String(pid)]); return result.ok }
async function findRuntimePid(installPath: string, profile: RuntimeProfile) { const result = await runCommand('pgrep', ['-f', `${installPath}.+${profile.processPattern}`]); if (!result.ok) return null; const pid = Number(result.stdout.trim().split(/\s+/)[0]); return Number.isFinite(pid) && pid > 0 ? pid : null }
async function getTail(filePath: string, lines = 60) { try { const result = await runCommand('tail', ['-n', String(lines), filePath]); return result.stdout || result.stderr || '' } catch { return '' } }

async function stopPid(pid: number) {
  await runCommand('kill', [String(pid)])
  for (let i = 0; i < 12; i += 1) { await sleep(1000); if (!(await isProcessRunning(pid))) return true }
  await runCommand('kill', ['-9', String(pid)])
  return !(await isProcessRunning(pid))
}

function startCommand(profile: RuntimeProfile, executable: string, input: ServerJobPayload) {
  const args = profile.args(input)
  if (profile.command === 'wine') return { command: 'wine', args: [executable, ...args] }
  return { command: executable, args }
}

export async function refreshServerStatus(payload: unknown, ctx?: JobContext) {
  const input = readPayload(payload)
  const installPath = resolveInstallPath(input.installPath)
  const profile = runtimeProfile(input.game)
  const pidFile = path.join(installPath, '.apexgsp.pid')
  await ctx?.reportProgress({ progress: 35, message: 'Checking server process', serverId: input.server_id, game: profile.game })
  let pid = await readPid(pidFile)
  if (pid && await isProcessRunning(pid)) {
    await ctx?.reportProgress({ progress: 100, message: 'Server is running', serverId: input.server_id, pid, game: profile.game })
    return { message: 'Server is running', serverId: input.server_id, status: 'running', pid, game: profile.game }
  }
  pid = await findRuntimePid(installPath, profile)
  if (pid) {
    await fs.writeFile(pidFile, String(pid), 'utf8')
    await ctx?.reportProgress({ progress: 100, message: 'Server is running', serverId: input.server_id, pid, game: profile.game })
    return { message: 'Server is running', serverId: input.server_id, status: 'running', pid, game: profile.game }
  }
  await fs.rm(pidFile, { force: true })
  return { message: 'Server process is not running', serverId: input.server_id, status: 'stopped', pid: null, game: profile.game }
}

export async function startServer(payload: unknown, ctx?: JobContext) {
  const input = readPayload(payload)
  const installPath = resolveInstallPath(input.installPath)
  const profile = runtimeProfile(input.game)
  const pidFile = path.join(installPath, '.apexgsp.pid')
  const logDir = path.join(installPath, 'Logs')
  const logFile = path.join(logDir, 'apexgsp-server.log')
  await ctx?.reportProgress({ progress: 10, message: 'Preparing to start server', serverId: input.server_id, game: profile.game })
  const currentStatus = await refreshServerStatus(payload)
  if (currentStatus.status === 'running') {
    await ctx?.reportProgress({ progress: 100, message: 'Server is already running', serverId: input.server_id, pid: currentStatus.pid, game: profile.game })
    return currentStatus
  }
  const executable = await findExecutable(installPath, profile, input.executablePath || input.executable_path)
  if (!executable) throw new Error(`Server executable not found in ${installPath}`)
  if (profile.command === 'wine') { const wine = await findTool('wine', ['/usr/bin/wine', '/usr/local/bin/wine']); if (!wine) throw new Error('Wine is not installed. Install wine64 before starting this server.') }
  await fs.mkdir(logDir, { recursive: true })
  const command = startCommand(profile, executable, input)
  await ctx?.reportProgress({ progress: 35, message: `Starting ${profile.game} server process`, serverId: input.server_id, game: profile.game, command: command.args.join(' ') })
  const out = fsSync.openSync(logFile, 'a')
  const err = fsSync.openSync(logFile, 'a')
  const child = spawn(command.command, command.args, { cwd: installPath, detached: true, stdio: ['ignore', out, err], env: { ...process.env, LD_LIBRARY_PATH: installPath, WINEDEBUG: process.env.WINEDEBUG || '-all' } })
  child.unref()
  fsSync.closeSync(out)
  fsSync.closeSync(err)
  if (!child.pid) throw new Error('Failed to obtain server PID')
  await fs.writeFile(pidFile, String(child.pid), 'utf8')
  await ctx?.reportProgress({ progress: 60, message: 'Waiting for server process to remain alive', serverId: input.server_id, pid: child.pid, game: profile.game })
  await sleep(profile.game === 'dayz' ? 12000 : 8000)
  let runningPid = child.pid
  if (!(await isProcessRunning(runningPid))) { const discovered = await findRuntimePid(installPath, profile); if (discovered) runningPid = discovered }
  if (!(await isProcessRunning(runningPid))) {
    await fs.rm(pidFile, { force: true })
    const logTail = await getTail(logFile)
    return { message: 'Server failed to stay running', serverId: input.server_id, status: 'error', pid: null, logFile, logTail, game: profile.game }
  }
  await fs.writeFile(pidFile, String(runningPid), 'utf8')
  await ctx?.reportProgress({ progress: 100, message: 'Server is running', serverId: input.server_id, pid: runningPid, game: profile.game })
  return { message: 'Server is running', serverId: input.server_id, status: 'running', pid: runningPid, logFile, game: profile.game }
}

export async function stopServer(payload: unknown, ctx?: JobContext) {
  const input = readPayload(payload)
  const installPath = resolveInstallPath(input.installPath)
  const profile = runtimeProfile(input.game)
  const pidFile = path.join(installPath, '.apexgsp.pid')
  await ctx?.reportProgress({ progress: 20, message: 'Stopping server', serverId: input.server_id, game: profile.game })
  let pid = await readPid(pidFile)
  if (!pid || !(await isProcessRunning(pid))) pid = await findRuntimePid(installPath, profile)
  if (!pid || !(await isProcessRunning(pid))) {
    await fs.rm(pidFile, { force: true })
    await ctx?.reportProgress({ progress: 100, message: 'Server is already stopped', serverId: input.server_id, game: profile.game })
    return { message: 'Server is already stopped', serverId: input.server_id, status: 'stopped', game: profile.game }
  }
  const stopped = await stopPid(pid)
  await fs.rm(pidFile, { force: true })
  if (!stopped) throw new Error(`Failed to stop server process ${pid}`)
  await ctx?.reportProgress({ progress: 100, message: 'Server stopped', serverId: input.server_id, game: profile.game })
  return { message: 'Server stopped', serverId: input.server_id, status: 'stopped', game: profile.game }
}

export async function restartServer(payload: unknown, ctx?: JobContext) {
  await ctx?.reportProgress({ progress: 10, message: 'Restarting server' })
  await stopServer(payload, ctx)
  await ctx?.reportProgress({ progress: 55, message: 'Starting server again' })
  return startServer(payload, ctx)
}
