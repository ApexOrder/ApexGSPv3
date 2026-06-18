export interface Profile {
  id: string
  discord_id: string | null
  username: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export type LicenceStatus = 'active' | 'inactive' | 'suspended' | 'trial'

export interface Licence {
  id: string
  user_id: string
  key: string
  status: LicenceStatus
  max_nodes: number
  expires_at: string | null
  created_at: string
  updated_at: string
}

export type NodeStatus = 'pending' | 'online' | 'offline'

export interface Node {
  id: string
  user_id: string
  name: string
  hostname: string | null
  ip_address: string | null
  status: NodeStatus
  registration_token: string
  node_secret: string
  token_used: boolean
  daemon_version: string | null
  last_heartbeat: string | null
  created_at: string
  updated_at: string
}

export type GameServerStatus = 'installing' | 'stopped' | 'starting' | 'running' | 'stopping' | 'error' | string

export interface GameServer {
  id: string
  user_id: string
  node_id: string
  name: string
  slug: string
  game: string
  install_path: string
  executable_path: string | null
  status: GameServerStatus
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Heartbeat {
  id: string
  node_id: string
  timestamp: string
  status: 'online' | 'degraded'
  metadata: Record<string, unknown> | null
}

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface Job {
  id: string
  node_id: string
  user_id: string
  type: string
  payload: Record<string, unknown> | null
  status: JobStatus
  result: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

// Daemon API types
export interface RegisterRequest {
  token: string
  hostname?: string
  ip_address?: string
  daemon_version?: string
}

export interface RegisterResponse {
  success: boolean
  node_id: string
  node_secret: string
}

export interface HeartbeatRequest {
  node_id: string
  node_secret: string
  daemon_version?: string
  metadata?: Record<string, unknown>
}

export interface HeartbeatResponse {
  success: boolean
  timestamp: string
}
