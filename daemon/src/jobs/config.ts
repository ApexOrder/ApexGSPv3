import fs from 'node:fs/promises'
import path from 'node:path'
import type { JobContext } from './index.js'

type ConfigPayload = {
  server_id?: string
  installPath?: string
  install_path?: string
  settings?: Record<string, unknown>
}

function readPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Missing config payload')
  const input = payload as ConfigPayload
  const serverId = input.server_id
  const installPath = input.installPath || input.install_path
  if (!serverId) throw new Error('Missing server_id')
  if (!installPath) throw new Error('Missing installPath')
  return { serverId, installPath, settings: input.settings || {} }
}

function safeInstallPath(value: string) {
  const root = path.resolve(process.env.APEXGSP_SERVERS_ROOT || '/opt/apexgsp/servers')
  const resolved = path.resolve(value)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe install path: ${resolved}`)
  return resolved
}

function text(value: unknown, fallback: string) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  return fallback
}

function intText(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return String(fallback)
  return String(Math.min(max, Math.max(min, Math.round(parsed))))
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function property(name: string, value: string) {
  return `  <property name="${name}" value="${escapeXml(value)}" />`
}

function buildConfig(settings: Record<string, unknown>) {
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

  return [
    '<?xml version="1.0"?>',
    '<ServerSettings>',
    property('ServerName', serverName),
    property('ServerPassword', serverPassword),
    property('ServerPort', serverPort),
    property('ServerMaxPlayerCount', maxPlayers),
    property('ServerAdminSlots', '0'),
    property('ServerAdminSlotsPermission', '0'),
    property('ServerReservedSlots', '0'),
    property('ServerReservedSlotsPermission', '100'),
    property('AdminFileName', adminFileName),
    property('GameWorld', gameWorld),
    property('WorldGenSeed', worldGenSeed),
    property('WorldGenSize', worldGenSize),
    property('GameName', serverName),
    property('GameDifficulty', difficulty),
    property('XPMultiplier', xpMultiplier),
    property('LootAbundance', lootAbundance),
    property('BloodMoonFrequency', bloodMoonFrequency),
    property('BloodMoonWarning', '8'),
    property('EACEnabled', 'true'),
    '</ServerSettings>',
    '',
  ].join('\n')
}

export async function updateServerConfig(payload: unknown, ctx?: JobContext) {
  const input = readPayload(payload)
  const installPath = safeInstallPath(input.installPath)
  const configPath = path.join(installPath, 'serverconfig.xml')

  await ctx?.reportProgress({ progress: 25, message: 'Building server configuration', serverId: input.serverId })

  const config = buildConfig(input.settings)
  await fs.writeFile(configPath, config, 'utf8')

  await ctx?.reportProgress({ progress: 100, message: 'Server configuration saved', serverId: input.serverId, configPath })

  return {
    message: 'Server configuration saved',
    serverId: input.serverId,
    status: 'config_saved',
    configPath,
    settings: input.settings,
  }
}
