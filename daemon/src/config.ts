import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'

export interface DaemonConfig {
  envPath: string
  panelUrl: string
  apiUrl: string
  supabaseAnonKey: string
  registrationToken: string
  nodeId: string
  nodeSecret: string
  heartbeatIntervalMs: number
  jobPollIntervalMs: number
  timeZone: string
}

const DEFAULT_ENV_PATH = '/opt/apexgsp-daemon/.env'

function requireValue(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') throw new Error(`Missing required environment value: ${name}`)
  return value.trim().replace(/\/$/, '')
}

function optionalTimeZone() {
  return process.env.APEXGSP_TIME_ZONE?.trim() || process.env.TZ?.trim() || ''
}

export function applyDaemonTimeZone(timeZone: string) {
  if (!timeZone) return
  process.env.TZ = timeZone
}

export function loadConfig(): DaemonConfig {
  const envPath = process.env.APEXGSP_ENV_PATH || DEFAULT_ENV_PATH
  dotenv.config({ path: envPath })

  const panelUrl = requireValue('APEXGSP_PANEL_URL', process.env.APEXGSP_PANEL_URL)
  const apiUrl = requireValue('APEXGSP_API_URL', process.env.APEXGSP_API_URL)
  const supabaseAnonKey = requireValue('APEXGSP_SUPABASE_ANON_KEY', process.env.APEXGSP_SUPABASE_ANON_KEY)
  const registrationToken = process.env.APEXGSP_REGISTRATION_TOKEN?.trim() || ''
  const timeZone = optionalTimeZone()
  applyDaemonTimeZone(timeZone)

  return {
    envPath,
    panelUrl,
    apiUrl,
    supabaseAnonKey,
    registrationToken,
    nodeId: process.env.APEXGSP_NODE_ID?.trim() || '',
    nodeSecret: process.env.APEXGSP_NODE_SECRET?.trim() || '',
    heartbeatIntervalMs: Number(process.env.APEXGSP_HEARTBEAT_INTERVAL_MS || 30_000),
    jobPollIntervalMs: Number(process.env.APEXGSP_JOB_POLL_INTERVAL_MS || 30_000),
    timeZone,
  }
}

export function persistEnvValue(envPath: string, key: string, value: string): void {
  const dir = path.dirname(envPath)
  fs.mkdirSync(dir, { recursive: true })

  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
  const lines = existing.split(/\r?\n/).filter(Boolean)
  const next = `${key}=${value}`
  const index = lines.findIndex(line => line.startsWith(`${key}=`))

  if (index >= 0) lines[index] = next
  else lines.push(next)

  fs.writeFileSync(envPath, `${lines.join('\n')}\n`, { mode: 0o600 })
}
