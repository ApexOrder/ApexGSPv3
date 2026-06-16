import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

export interface DaemonConfig {
  panelUrl: string
  token?: string
  nodeId?: string
  nodeSecret?: string
  port: number
  heartbeatIntervalMs: number
}

const CONFIG_PATH = process.env.APEXGSP_CONFIG ?? resolve(homedir(), '.apexgsp', 'daemon.json')

const defaults: DaemonConfig = {
  panelUrl: process.env.PANEL_URL ?? '',
  token: process.env.NODE_TOKEN,
  port: parseInt(process.env.PORT ?? '7420', 10),
  heartbeatIntervalMs: 30_000,
}

export function loadConfig(): DaemonConfig {
  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = readFileSync(CONFIG_PATH, 'utf-8')
      return { ...defaults, ...JSON.parse(raw) }
    } catch {
      // fall through to defaults
    }
  }
  return { ...defaults }
}

export function persistConfig(config: DaemonConfig): void {
  const dir = resolve(CONFIG_PATH, '..')
  mkdirSync(dir, { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
}
