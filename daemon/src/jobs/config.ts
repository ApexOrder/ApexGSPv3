import fs from 'node:fs/promises'
import path from 'node:path'
import type { JobContext } from './index.js'

type ConfigPayload = {
  server_id?: string
  installPath?: string
  install_path?: string
  game?: string
  settings?: Record<string, unknown>
}

function readPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Missing config payload')
  const input = payload as ConfigPayload
  const serverId = input.server_id
  const installPath = input.installPath || input.install_path
  if (!serverId) throw new Error('Missing server_id')
  if (!installPath) throw new Error('Missing installPath')
  return { serverId, installPath, game: (input.game || '7dtd').toLowerCase(), settings: input.settings || {} }
}

function safeInstallPath(value: string) {
  const root = path.resolve(process.env.APEXGSP_SERVERS_ROOT || '/opt/apexgsp/servers')
  const resolved = path.resolve(value)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe install path: ${resolved}`)
  return resolved
}

function text(value: unknown, fallback: string) { if (typeof value === 'string') return value.trim(); return fallback }
function intText(value: unknown, fallback: number, min: number, max: number) { const parsed = Number(value); if (!Number.isFinite(parsed)) return String(fallback); return String(Math.min(max, Math.max(min, Math.round(parsed)))) }
function boolText(value: unknown, fallback: boolean) { if (typeof value === 'boolean') return value ? '1' : '0'; if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.toLowerCase()) ? '1' : ['false', '0', 'no', 'off'].includes(value.toLowerCase()) ? '0' : fallback ? '1' : '0'; return fallback ? '1' : '0' }
function escapeXml(value: string) { return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&apos;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') }
function escapeCfg(value: string) { return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') }
function property(name: string, value: string) { return `  <property name="${name}" value="${escapeXml(value)}" />` }

function build7dtdConfig(settings: Record<string, unknown>) {
  const serverName = text(settings.serverName, 'ApexGSP 7DTD Server')
  const serverPassword = text(settings.serverPassword, '')
  const adminFileName = text(settings.adminFileName, 'serveradmin.xml')
  const serverPort = intText(settings.serverPort, 26900, 1024, 65535)
  const maxPlayers = intText(settings.maxPlayers, 8, 1, 64)
  const gameWorld = text(settings.gameWorld, 'Navezgane')
  const worldGenSeed = text(settings.worldGenSeed, 'ApexGSP')
  const worldGenSize = intText(settings.worldGenSize, 6144, 2048, 16384)
  const difficulty = intText(settings.difficulty, 2, 0, 5)
  const xpMultiplier = intText(settings.xpMultiplier, 100, 25, 1000)
  const lootAbundance = intText(settings.lootAbundance, 100, 0, 1000)
  const bloodMoonFrequency = intText(settings.bloodMoonFrequency, 7, 0, 30)
  return ['<?xml version="1.0"?>', '<ServerSettings>', property('ServerName', serverName), property('ServerPassword', serverPassword), property('ServerPort', serverPort), property('ServerMaxPlayerCount', maxPlayers), property('ServerAdminSlots', '0'), property('ServerAdminSlotsPermission', '0'), property('ServerReservedSlots', '0'), property('ServerReservedSlotsPermission', '100'), property('AdminFileName', adminFileName), property('GameWorld', gameWorld), property('WorldGenSeed', worldGenSeed), property('WorldGenSize', worldGenSize), property('GameName', serverName), property('GameDifficulty', difficulty), property('XPMultiplier', xpMultiplier), property('LootAbundance', lootAbundance), property('BloodMoonFrequency', bloodMoonFrequency), property('BloodMoonWarning', '8'), property('EACEnabled', 'true'), '</ServerSettings>', ''].join('\n')
}

function cfgString(value: string) { return `"${escapeCfg(value)}"` }
function upsertCfgScalar(config: string, key: string, value: string) { const line = `${key} = ${value};`; const pattern = new RegExp(`(^|\\n)\\s*${key}\\s*=\\s*[^;\\n]*;`, 'i'); if (pattern.test(config)) return config.replace(pattern, match => `${match.startsWith('\n') ? '\n' : ''}${line}`); const insertBefore = config.search(/\n\s*class\s+Missions\b/i); if (insertBefore >= 0) return `${config.slice(0, insertBefore).trimEnd()}\n${line}\n${config.slice(insertBefore)}`; return `${config.trimEnd()}\n${line}\n` }
function upsertDayzMission(config: string, mission: string) { const escaped = cfgString(mission); if (/template\s*=\s*"[^"]*"\s*;/i.test(config)) return config.replace(/template\s*=\s*"[^"]*"\s*;/i, `template = ${escaped};`); return `${config.trimEnd()}\n\nclass Missions {\n  class DayZ {\n    template = ${escaped};\n  };\n};\n` }

async function buildDayzConfig(configPath: string, settings: Record<string, unknown>) {
  let config = ''
  try { config = await fs.readFile(configPath, 'utf8') } catch { config = '' }
  if (!config.trim()) config = 'class Missions {\n  class DayZ {\n    template = "dayzOffline.chernarusplus";\n  };\n};\n'

  const hostname = text(settings.serverName, 'ApexGSP DayZ Server')
  const description = text(settings.description, '')
  const serverPassword = text(settings.serverPassword, '')
  const adminPassword = text(settings.adminPassword, 'changeme')
  const maxPlayers = intText(settings.maxPlayers, 60, 1, 127)
  const port = intText(settings.serverPort, 2302, 1024, 65535)
  const mission = text(settings.mission, 'dayzOffline.chernarusplus')
  const instanceId = intText(settings.instanceId, 1, 1, 9999)
  const shardId = text(settings.shardId, '123abc')
  const whitelist = boolText(settings.enableWhitelist, false)
  const thirdPerson = boolText(settings.thirdPerson, true)
  const crosshair = boolText(settings.crosshair, false)
  const von = boolText(settings.vonEnabled, true)
  const vonCodecQuality = intText(settings.vonCodecQuality, 20, 0, 30)
  const disablePersonalLight = boolText(settings.disablePersonalLight, true)
  const lightingConfig = intText(settings.lightingConfig, 0, 0, 1)
  const serverTime = text(settings.serverTime, 'SystemTime')
  const timeAcceleration = intText(settings.timeAcceleration, 1, 1, 64)
  const nightAcceleration = intText(settings.nightAcceleration, 1, 1, 64)
  const timePersistent = boolText(settings.serverTimePersistent, false)
  const loginConcurrent = intText(settings.loginQueueConcurrentPlayers, 5, 1, 100)
  const loginMax = intText(settings.loginQueueMaxPlayers, 500, 1, 5000)
  const verifySignatures = intText(settings.verifySignatures, 2, 0, 2)
  const forceSameBuild = boolText(settings.forceSameBuild, true)
  const guaranteedUpdates = intText(settings.guaranteedUpdates, 1, 0, 1)
  const storageAutoFix = boolText(settings.storageAutoFix, true)
  const logAverageFps = boolText(settings.logAverageFps, false)
  const logMemory = boolText(settings.logMemory, false)
  const logPlayers = boolText(settings.logPlayers, false)
  const logFile = text(settings.logFile, 'server_console.log')
  const adminLogPlayerHitsOnly = boolText(settings.adminLogPlayerHitsOnly, false)

  config = upsertCfgScalar(config, 'hostname', cfgString(hostname))
  config = upsertCfgScalar(config, 'description', cfgString(description))
  config = upsertCfgScalar(config, 'password', cfgString(serverPassword))
  config = upsertCfgScalar(config, 'passwordAdmin', cfgString(adminPassword))
  config = upsertCfgScalar(config, 'enableWhitelist', whitelist)
  config = upsertCfgScalar(config, 'maxPlayers', maxPlayers)
  config = upsertCfgScalar(config, 'serverPort', port)
  config = upsertCfgScalar(config, 'verifySignatures', verifySignatures)
  config = upsertCfgScalar(config, 'forceSameBuild', forceSameBuild)
  config = upsertCfgScalar(config, 'disableVoN', von === '1' ? '0' : '1')
  config = upsertCfgScalar(config, 'vonCodecQuality', vonCodecQuality)
  config = upsertCfgScalar(config, 'shardId', cfgString(shardId))
  config = upsertCfgScalar(config, 'disable3rdPerson', thirdPerson === '1' ? '0' : '1')
  config = upsertCfgScalar(config, 'disableCrosshair', crosshair === '1' ? '0' : '1')
  config = upsertCfgScalar(config, 'disablePersonalLight', disablePersonalLight)
  config = upsertCfgScalar(config, 'lightingConfig', lightingConfig)
  config = upsertCfgScalar(config, 'serverTime', cfgString(serverTime))
  config = upsertCfgScalar(config, 'serverTimeAcceleration', timeAcceleration)
  config = upsertCfgScalar(config, 'serverNightTimeAcceleration', nightAcceleration)
  config = upsertCfgScalar(config, 'serverTimePersistent', timePersistent)
  config = upsertCfgScalar(config, 'guaranteedUpdates', guaranteedUpdates)
  config = upsertCfgScalar(config, 'loginQueueConcurrentPlayers', loginConcurrent)
  config = upsertCfgScalar(config, 'loginQueueMaxPlayers', loginMax)
  config = upsertCfgScalar(config, 'instanceId', instanceId)
  config = upsertCfgScalar(config, 'storageAutoFix', storageAutoFix)
  config = upsertCfgScalar(config, 'logAverageFps', logAverageFps)
  config = upsertCfgScalar(config, 'logMemory', logMemory)
  config = upsertCfgScalar(config, 'logPlayers', logPlayers)
  config = upsertCfgScalar(config, 'logFile', cfgString(logFile))
  config = upsertCfgScalar(config, 'adminLogPlayerHitsOnly', adminLogPlayerHitsOnly)
  config = upsertDayzMission(config, mission)
  return `${config.trimEnd()}\n`
}

export async function updateServerConfig(payload: unknown, ctx?: JobContext) {
  const input = readPayload(payload)
  const installPath = safeInstallPath(input.installPath)
  const isDayz = input.game === 'dayz'
  const configPath = path.join(installPath, isDayz ? 'serverDZ.cfg' : 'serverconfig.xml')
  await ctx?.reportProgress({ progress: 25, message: 'Building server configuration', serverId: input.serverId, game: input.game })
  const config = isDayz ? await buildDayzConfig(configPath, input.settings) : build7dtdConfig(input.settings)
  await fs.writeFile(configPath, config, 'utf8')
  await ctx?.reportProgress({ progress: 100, message: 'Server configuration saved', serverId: input.serverId, configPath })
  return { message: 'Server configuration saved', serverId: input.serverId, status: 'config_saved', configPath, settings: input.settings }
}
