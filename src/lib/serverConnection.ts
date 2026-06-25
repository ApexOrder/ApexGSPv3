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
  return server.nodes?.ip_address || server.nodes?.hostname || 'set-node-ip'
}

export function getServerConnection(server: ServerWithNodeish) {
  return `${getServerHost(server)}:${getServerGamePort(server)}`
}

export function getServerQueryConnection(server: ServerWithNodeish) {
  return `${getServerHost(server)}:${getServerQueryPort(server)}`
}
