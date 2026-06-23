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
  steamPlatform?: 'windows' | 'linux'
  runtime?: 'native' | 'wine'
  requiresSteamAccount?: boolean
}

const GAME_PROFILES: GameProfile[] = [
  { id: '7dtd', aliases: ['7dtd', '7_days_to_die', '7-days-to-die'], displayName: '7 Days To Die', steamAppId: '294420', executableNames: ['7DaysToDieServer.x86_64', '7DaysToDieServer.x86'], folders: ['Saves', 'Logs', 'Backups', 'Mods'], defaultName: '7 Days To Die Server', steamPlatform: 'linux', runtime: 'native' },
  { id: 'dayz', aliases: ['dayz', 'day-z', 'day_z'], displayName: 'DayZ', steamAppId: '223350', executableNames: ['DayZServer_x64.exe', 'DayZServer.exe'], folders: ['profiles', 'mpmissions', 'keys', 'Logs', 'Backups', 'Mods'], defaultName: 'DayZ Server', steamPlatform: 'windows', runtime: 'wine', requiresSteamAccount: true },
]

type CreateServerPayload = { game?: string; serverName?: string; name?: string; slug?: string; installDir?: string; installPath?: string }

function readPayload(payload: unknown): CreateServerPayload { if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {}; return payload as CreateServerPayload }
function getProfile(game?: string) { const value = (game || '7dtd').toLowerCase(); const profile = GAME_PROFILES.find(item => item.aliases.includes(value)); if (!profile) throw new Error(`Unsupported game for create_server: ${game}`); return profile }
function slugify(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9-_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') }
function tailText(value: string, max = 4000) { const text = value || ''; return text.length > max ? text.slice(text.length - max) : text }
function redact(value: string) { const password = process.env.APEXGSP_STEAM_PASSWORD; return password ? value.split(password).join('[REDACTED_STEAM_PASSWORD]') : value }

function resolveInstallTarget(payload: CreateServerPayload, profile: GameProfile) {
  const name = payload.serverName || payload.name || profile.defaultName
  const slug = slugify(payload.slug || name)
  if (!slug) throw new Error('Server name or slug must contain at least one letter or number')
  const root = path.resolve(process.env.APEXGSP_SERVERS_ROOT || DEFAULT_SERVERS_ROOT)
  const requestedPath = payload.installDir || payload.installPath
  const installPath = path.resolve(requestedPath || path.join(root, slug))
  if (installPath !== root && !installPath.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe install path: server installs must stay inside ${root}`)
  return { name, slug, root, installPath }
}

async function createFolderLayout(root: string, installPath: string, profile: GameProfile) { await fs.mkdir(root, { recursive: true }); await fs.mkdir(installPath, { recursive: true }); for (const folder of profile.folders) await fs.mkdir(path.join(installPath, folder), { recursive: true }) }
async function pathExists(filePath: string) { try { await fs.access(filePath); return true } catch { return false } }
async function findServerExecutable(installPath: string, profile: GameProfile) { for (const fileName of profile.executableNames) { const executablePath = path.join(installPath, fileName); if (await pathExists(executablePath)) return executablePath } return null }
async function findTool(command: string, candidates: string[]) { const which = await runCommand('which', [command]); if (which.ok && which.stdout) return which.stdout.split('\n')[0]; for (const candidate of candidates) { const exists = await runCommand('test', ['-x', candidate]); if (exists.ok) return candidate } return null }

function getSteamLoginArgs(profile: GameProfile) {
  if (!profile.requiresSteamAccount) return ['+login', 'anonymous']
  const username = process.env.APEXGSP_STEAM_USERNAME
  const password = process.env.APEXGSP_STEAM_PASSWORD
  if (!username || !password) throw new Error(`${profile.displayName} cannot install anonymously. Add APEXGSP_STEAM_USERNAME and APEXGSP_STEAM_PASSWORD to the daemon .env, then restart apexgspd.`)
  return ['+login', username, password]
}

async function installSteamGameServer(steamToolPath: string, installPath: string, profile: GameProfile) {
  const logDir = path.join(installPath, 'Logs')
  const logFile = path.join(logDir, 'apexgsp-install.log')
  await fs.mkdir(logDir, { recursive: true })
  const args: string[] = []
  if (profile.steamPlatform === 'windows') args.push('+@sSteamCmdForcePlatformType', 'windows')
  args.push('+force_install_dir', installPath, ...getSteamLoginArgs(profile), '+app_update', profile.steamAppId, 'validate', '+quit')
  const result = await runCommand(steamToolPath, args, 45 * 60 * 1000)
  const output = redact(`${result.stdout || ''}\n${result.stderr || ''}\n${result.error || ''}`.trim())
  await fs.writeFile(logFile, `${output}\n`, 'utf8')
  return { ...result, logFile, outputTail: tailText(output) }
}

async function writeDayZDefaults(installPath: string, serverName: string) {
  const configPath = path.join(installPath, 'serverDZ.cfg')
  if (await pathExists(configPath)) return
  await fs.writeFile(configPath, `hostname = "${serverName.replace(/"/g, '')}";\npassword = "";\npasswordAdmin = "changeme";\nmaxPlayers = 60;\nverifySignatures = 2;\nforceSameBuild = 1;\ndisableVoN = 0;\nvonCodecQuality = 20;\ndisable3rdPerson = 0;\ndisableCrosshair = 0;\nserverTime = "SystemTime";\nserverTimeAcceleration = 1;\nserverNightTimeAcceleration = 1;\nguaranteedUpdates = 1;\nloginQueueConcurrentPlayers = 5;\nloginQueueMaxPlayers = 500;\ninstanceId = 1;\nstorageAutoFix = 1;\nclass Missions {\n  class DayZ {\n    template = "dayzOffline.chernarusplus";\n  };\n};\n`, 'utf8')
}

export async function createServer(payload: unknown, ctx?: JobContext) {
  const input = readPayload(payload)
  const profile = getProfile(input.game)
  const target = resolveInstallTarget(input, profile)
  await ctx?.reportProgress({ progress: 20, message: 'create_server request validated', game: profile.id, path: target.installPath })
  await ctx?.reportProgress({ progress: 35, message: 'Creating server folder layout', path: target.installPath })
  await createFolderLayout(target.root, target.installPath, profile)
  const existingExecutable = await findServerExecutable(target.installPath, profile)
  if (existingExecutable) {
    if (profile.id === 'dayz') await writeDayZDefaults(target.installPath, target.name)
    await ctx?.reportProgress({ progress: 100, message: `${profile.displayName} server already installed`, path: target.installPath, executablePath: existingExecutable })
    return { message: `${profile.displayName} server already installed`, game: profile.id, appId: profile.steamAppId, runtime: profile.runtime, steamPlatform: profile.steamPlatform, installed: true, alreadyInstalled: true, executablePath: existingExecutable, ...target }
  }
  const steamToolPath = await findTool('steamcmd', ['/usr/games/steamcmd', '/usr/bin/steamcmd', '/usr/local/bin/steamcmd'])
  if (!steamToolPath) throw new Error('SteamCMD is not installed. Run install_steamcmd first.')
  if (profile.runtime === 'wine') { const winePath = await findTool('wine', ['/usr/bin/wine', '/usr/local/bin/wine']); if (!winePath) throw new Error(`${profile.displayName} requires Wine on Linux. Install wine64/wine before creating this server.`) }
  await ctx?.reportProgress({ progress: 45, message: `Installing ${profile.displayName} dedicated server`, path: target.installPath, runtime: profile.runtime })
  const install = await installSteamGameServer(steamToolPath, target.installPath, profile)
  if (!install.ok) throw new Error(`${profile.displayName} install failed. Full log: ${install.logFile}\n${install.outputTail}`)
  if (profile.id === 'dayz') await writeDayZDefaults(target.installPath, target.name)
  await ctx?.reportProgress({ progress: 85, message: `Verifying ${profile.displayName} installation`, path: target.installPath })
  const executablePath = await findServerExecutable(target.installPath, profile)
  if (!executablePath) throw new Error(`${profile.displayName} install finished but server executable was not found in ${target.installPath}`)
  await ctx?.reportProgress({ progress: 100, message: `${profile.displayName} server installed and verified`, path: target.installPath, executablePath })
  return { message: `${profile.displayName} server installed and verified`, game: profile.id, appId: profile.steamAppId, runtime: profile.runtime, steamPlatform: profile.steamPlatform, installed: true, alreadyInstalled: false, executablePath, ...target }
}
