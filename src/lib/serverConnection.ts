import type { GameServer } from '@/lib/types'

type Nodeish = {
  hostname?: string | null
  ip_address?: string | null
  name?: string | null
} | null | undefined

type ServerWithNodeish = GameServer & { nodes?: Nodeish }

function readNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null
}

function normaliseGame(game?: string | null) {
  return String(game || '7dtd').toLowerCase()
}

function fallbackGamePort(server: GameServer) {
  return normaliseGame(server.game) === 'dayz' ? 2302 : 26900
}

function fallbackQueryPort(server: GameServer) {
  return normaliseGame(server.game) === 'dayz' ? 27016 : 26901
}

function looksLikeMachineName(value?: string | null) {
  const host = String(value || '').toLowerCase()
  return !host || host === 'localhost' || host.startsWith('ubuntu-') || host.endsWith('.local')
}

function browserHost() {
  if (typeof window === 'undefined') return ''
  return window.location.hostname || ''
}

function metadataPublicHost(server: GameServer) {
  const metadata = server.metadata || {}
  const value = metadata.publicHost || metadata.public_host || metadata.connectionHost || metadata.connection_host
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

export function getServerGamePort(server: GameServer) {
  const metadata = server.metadata || {}
  const settings = metadata.settings as Record<string, unknown> | undefined
  const ports = metadata.ports as Record<string, unknown> | undefined
  return readNumber(settings?.serverPort) || readNumber(ports?.game) || fallbackGamePort(server)
}

export function getServerQueryPort(server: GameServer) {
  const metadata = server.metadata || {}
  const ports = metadata.ports as Record<string, unknown> | undefined
  return readNumber(ports?.query) || readNumber(ports?.steamQuery) || fallbackQueryPort(server)
}

export function getServerHost(server: ServerWithNodeish) {
  const publicHost = metadataPublicHost(server)
  if (publicHost) return publicHost
  if (server.nodes?.ip_address) return server.nodes.ip_address
  if (!looksLikeMachineName(server.nodes?.hostname)) return server.nodes?.hostname || 'set-node-ip'
  return browserHost() || server.nodes?.hostname || 'set-node-ip'
}

export function getServerConnection(server: ServerWithNodeish) {
  return `${getServerHost(server)}:${getServerGamePort(server)}`
}

export function getServerQueryConnection(server: ServerWithNodeish) {
  return `${getServerHost(server)}:${getServerQueryPort(server)}`
}
