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

export function getServerGamePort(server: GameServer) {
  const metadata = server.metadata || {}
  const settings = metadata.settings as Record<string, unknown> | undefined
  const ports = metadata.ports as Record<string, unknown> | undefined
  return readNumber(settings?.serverPort) || readNumber(ports?.game) || (server.game === 'dayz' ? 2302 : 26900)
}

export function getServerHost(server: ServerWithNodeish) {
  return server.nodes?.hostname || server.nodes?.ip_address || 'set-node-hostname'
}

export function getServerConnection(server: ServerWithNodeish) {
  const host = getServerHost(server)
  const port = getServerGamePort(server)
  return `${host}:${port}`
}
