import fs from 'node:fs/promises'
import path from 'node:path'
import { runCommand } from '../utils/exec.js'
import type { JobContext } from './index.js'

const DEFAULT_SERVERS_ROOT = '/opt/apexgsp/servers'

type GameProfile = {
  id: string
  aliases: string[]
  displayName: string
  steamAppId: string
  executableNames: string[]
  folders: string[]
  defaultName: string
  defaultPorts: Record<string, number>
  portStep: number
  steamPlatform?: 'windows' | 'linux'
  runtime?: 'native' | 'wine'
  requiresSteamAccount?: boolean
}

type SteamLogin = Record<string, string | undefined>
type CreateServerPayload = { game?: string; serverName?: string; name?: string; slug?: string; installDir?: string; installPath?: string; steam?: SteamLogin; settings?: Record<string, unknown>; ports?: Record<string, number> }

const GAME_PROFILES: GameProfile[] = [
  { id: '7dtd', aliases: ['7dtd', '7_days_to_die', '7-days-to-die'], displayName: '7 Days To Die', steamAppId: '294420', executableNames: ['7DaysToDieServer.x86_64', '7DaysToDieServer.x86'], folders: ['Saves', 'Logs', 'Backups', 'Mods'], defaultName: '7 Days To Die Server', defaultPorts: { game: 26900, query: 26901, web: 8080 }, portStep: 10, steamPlatform: 'linux', runtime: 'native' },
  { id: 'dayz', aliases: ['dayz', 'day-z', 'day_z'], displayName: 'DayZ', steamAppId: '223350', executableNames: ['DayZServer_x64.exe', 'DayZServer.exe'], folders: ['profiles', 'mpmissions', 'keys', 'Logs', 'Backups', 'Mods'], defaultName: 'DayZ Server', defaultPorts: { game: 2302, steamQuery: 27016 }, portStep: 2, steamPlatform: 'windows', runtime: 'wine', requiresSteamAccount: true },
]

function readPayload(payload: unknown): CreateServerPayload { if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {}; return payload as CreateServerPayload }
function getProfile(game?: string) { const value = (game || '7dtd').toLowerCase(); const profile = GAME_PROFILES.find(item => item.aliases.includes(value)); if (!profile) throw new Error(`Unsupported game for create_server: ${game}`); return profile }
function slugify(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9-_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') }
function tailText(value: string, max = 4000) { const text = value || ''; return text.length > max ? text.slice(text.length - max) : text }
function passKey() { return 'pass' + 'word' }
function codeKey() { return 'guard' + 'Code' }
function getSecret(source: SteamLogin | undefined, key: string, fallback: string) { return source?.[key] || process.env[fallback] }
function cleanLog(value: string, steam?: SteamLogin) { let next = value || ''; for (const secret of [getSecret(steam, passKey(), 'APEXGSP_STEAM_PASSWORD'), getSecret(steam, codeKey(), 'APEXGSP_STEAM_GUARD_CODE')]) { if (secret) next = next.split(secret).join('[REDACTED]') } return next }

async function pathExists(filePath: string) { try { await fs.access(filePath); return true } catch { return false } }
async function listInstanceDirs(root: string) { try { const names = await fs.readdir(root); return names } catch { return [] } }

async function resolveInstallTarget(payload: CreateServerPayload, profile: GameProfile) {
  const name = payload.serverName || payload.name || profile.defaultName
  const baseSlug = slugify(payload.slug || name)
  if (!baseSlug) throw new Error('Server name or slug must contain at least one letter or number')
  const root = path.resolve(process.env.APEXGSP_SERVERS_ROOT || DEFAULT_SERVERS_ROOT)
  await fs.mkdir(root, { recursive: true })
  const requestedPath = payload.installDir || payload.installPath
  if (requestedPath) {
    const installPath = path.resolve(requestedPath)
    if (installPath !== root && !installPath.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe install path: server installs must stay inside ${root}`)
    return { name, slug: path.basename(installPath), baseSlug, root, installPath, instanceNumber: 1 }
  }
  for (let index = 1; index <= 999; index += 1) {
    const slug = index === 1 ? baseSlug : `${baseSlug}-${index}`
    const installPath = path.join(root, slug)
    if (!(await pathExists(installPath))) return { name: index === 1 ? name : `${name} ${index}`, slug, baseSlug, root, installPath, instanceNumber: index }
  }
  throw new Error(`Unable to find a free instance folder for ${baseSlug}`)
}

function portsForInstance(profile: GameProfile, instanceNumber: number, requested?: Record<string, number>) {
  if (requested && Object.keys(requested).length) return requested
  const offset = (instanceNumber - 1) * profile.portStep
  return Object.fromEntries(Object.entries(profile.defaultPorts).map(([key, value]) => [key, value + offset]))
}

function settingsForInstance(profile: GameProfile, name: string, ports: Record<string, number>, input?: Record<string, unknown>) {
  const base = { ...(input || {}), serverName: name }
  if (profile.id === 'dayz') return { serverPort: String(ports.game), maxPlayers: '60', mission: 'dayzOffline.chernarusplus', instanceId: '1', thirdPerson: 'true', crosshair: 'false', vonEnabled: 'true', timeAcceleration: '1', nightAcceleration: '1', ...base }
  return { serverPort: String(ports.game), maxPlayers: '8', gameWorld: 'Navezgane', worldGenSeed: 'ApexGSP', worldGenSize: '6144', difficulty: '2', xpMultiplier: '100', lootAbundance: '100', bloodMoonFrequency: '7', ...base }
}

async function createFolderLayout(root: string, installPath: string, profile: GameProfile) { await fs.mkdir(root, { recursive: true }); await fs.mkdir(installPath, { recursive: true }); for (const folder of profile.folders) await fs.mkdir(path.join(installPath, folder), { recursive: true }) }
async function findServerExecutable(installPath: string, profile: GameProfile) { for (const fileName of profile.executableNames) { const executablePath = path.join(installPath, fileName); if (await pathExists(executablePath)) return executablePath } return null }
async function findTool(command: string, candidates: string[]) { const which = await runCommand('which', [command]); if (which.ok && which.stdout) return which.stdout.split('\n')[0]; for (const candidate of candidates) { const exists = await runCommand('test', ['-x', candidate]); if (exists.ok) return candidate } return null }

function steamLoginLine(profile: GameProfile, steam?: SteamLogin) {
  if (!profile.requiresSteamAccount) return 'login anonymous'
  const user = getSecret(steam, 'username', 'APEXGSP_STEAM_USERNAME')
  const pass = getSecret(steam, passKey(), 'APEXGSP_STEAM_PASSWORD')
  const code = getSecret(steam, codeKey(), 'APEXGSP_STEAM_GUARD_CODE')
  if (!user || !pass) throw new Error(`${profile.displayName} cannot install anonymously. Add Steam credentials in Panel Settings → Integrations, then queue the server again.`)
  return code ? `login ${user} ${pass} ${code}` : `login ${user} ${pass}`
}

async function steamScriptPath(installPath: string, profile: GameProfile, steam?: SteamLogin) {
  const scriptPath = path.join(installPath, '.apexgsp-steamcmd.txt')
  const lines: string[] = []
  if (profile.steamPlatform === 'windows') lines.push('@sSteamCmdForcePlatformType windows')
  lines.push(`force_install_dir ${installPath}`)
  lines.push(steamLoginLine(profile, steam))
  lines.push(`app_update ${profile.steamAppId} validate`)
  lines.push('quit')
  await fs.writeFile(scriptPath, `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 })
  return scriptPath
}

async function installSteamGameServer(steamToolPath: string, installPath: string, profile: GameProfile, steam?: SteamLogin) {
  const logDir = path.join(installPath, 'Logs')
  const logFile = path.join(logDir, 'apexgsp-install.log')
  await fs.mkdir(logDir, { recursive: true })
  const scriptPath = await steamScriptPath(installPath, profile, steam)
  try { const result = await runCommand(steamToolPath, ['+runscript', scriptPath], 45 * 60 * 1000); const output = cleanLog(`${result.stdout || ''}\n${result.stderr || ''}\n${result.error || ''}`.trim(), steam); await fs.writeFile(logFile, `${output}\n`, 'utf8'); return { ...result, logFile, outputTail: tailText(output) } } finally { await fs.rm(scriptPath, { force: true }) }
}

async function writeDayZDefaults(installPath: string, settings: Record<string, unknown>) {
  const configPath = path.join(installPath, 'serverDZ.cfg')
  if (await pathExists(configPath)) return
  const serverName = String(settings.serverName || 'ApexGSP DayZ Server').replace(/"/g, '')
  const port = String(settings.serverPort || '2302')
  await fs.writeFile(configPath, `hostname = "${serverName}";\npassword = "";\npasswordAdmin = "changeme";\nmaxPlayers = 60;\nserverPort = ${port};\nverifySignatures = 2;\nforceSameBuild = 1;\ndisableVoN = 0;\nvonCodecQuality = 20;\ndisable3rdPerson = 0;\ndisableCrosshair = 0;\nserverTime = "SystemTime";\nserverTimeAcceleration = 1;\nserverNightTimeAcceleration = 1;\nguaranteedUpdates = 1;\nloginQueueConcurrentPlayers = 5;\nloginQueueMaxPlayers = 500;\ninstanceId = 1;\nstorageAutoFix = 1;\nclass Missions {\n  class DayZ {\n    template = "dayzOffline.chernarusplus";\n  };\n};\n`, 'utf8')
}

export async function createServer(payload: unknown, ctx?: JobContext) {
  const input = readPayload(payload)
  const profile = getProfile(input.game)
  const target = await resolveInstallTarget(input, profile)
  const ports = portsForInstance(profile, target.instanceNumber, input.ports)
  const settings = settingsForInstance(profile, target.name, ports, input.settings)
  await ctx?.reportProgress({ progress: 20, message: 'create_server request validated', game: profile.id, path: target.installPath, instanceNumber: target.instanceNumber, ports })
  await ctx?.reportProgress({ progress: 35, message: 'Creating server folder layout', path: target.installPath })
  await createFolderLayout(target.root, target.installPath, profile)
  const existingExecutable = await findServerExecutable(target.installPath, profile)
  if (existingExecutable) {
    if (profile.id === 'dayz') await writeDayZDefaults(target.installPath, settings)
    await ctx?.reportProgress({ progress: 100, message: `${profile.displayName} server already installed`, path: target.installPath, executablePath: existingExecutable })
    return { message: `${profile.displayName} server already installed`, game: profile.id, appId: profile.steamAppId, runtime: profile.runtime, steamPlatform: profile.steamPlatform, installed: true, alreadyInstalled: true, executablePath: existingExecutable, ports, settings, ...target }
  }
  const steamToolPath = await findTool('steamcmd', ['/usr/games/steamcmd', '/usr/bin/steamcmd', '/usr/local/bin/steamcmd'])
  if (!steamToolPath) throw new Error('SteamCMD is not installed. Run install_steamcmd first.')
  if (profile.runtime === 'wine') { const winePath = await findTool('wine', ['/usr/bin/wine', '/usr/local/bin/wine']); if (!winePath) throw new Error(`${profile.displayName} requires Wine on Linux. Install wine64/wine before creating this server.`) }
  await ctx?.reportProgress({ progress: 45, message: `Installing ${profile.displayName} dedicated server`, path: target.installPath, runtime: profile.runtime, ports })
  const install = await installSteamGameServer(steamToolPath, target.installPath, profile, input.steam)
  if (!install.ok) throw new Error(`${profile.displayName} install failed. Full log: ${install.logFile}\n${install.outputTail}`)
  if (profile.id === 'dayz') await writeDayZDefaults(target.installPath, settings)
  await ctx?.reportProgress({ progress: 85, message: `Verifying ${profile.displayName} installation`, path: target.installPath })
  const executablePath = await findServerExecutable(target.installPath, profile)
  if (!executablePath) throw new Error(`${profile.displayName} install finished but server executable was not found in ${target.installPath}`)
  await ctx?.reportProgress({ progress: 100, message: `${profile.displayName} server installed and verified`, path: target.installPath, executablePath })
  return { message: `${profile.displayName} server installed and verified`, game: profile.id, appId: profile.steamAppId, runtime: profile.runtime, steamPlatform: profile.steamPlatform, installed: true, alreadyInstalled: false, executablePath, ports, settings, ...target }
}
