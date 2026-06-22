import fs from 'node:fs/promises'
import path from 'node:path'
import { createBackup, listBackups } from './jobs/backups.js'
import type { JobContext } from './jobs/index.js'

type BackupMode = 'full' | 'world'
type ScheduleFrequency = 'hourly' | 'daily' | 'weekly'

export type BackupSchedule = {
  id: string
  serverId: string
  serverName?: string
  installPath: string
  backupMode: BackupMode
  enabled: boolean
  frequency: ScheduleFrequency
  time: string
  dayOfWeek?: number
  retention: number
  lastRunAt?: string | null
  nextRunAt: string
  lastResult?: string | null
  lastError?: string | null
  createdAt: string
  updatedAt: string
}

type SchedulePayload = {
  scheduleId?: string
  server_id?: string
  serverName?: string
  installPath?: string
  install_path?: string
  backupMode?: BackupMode
  enabled?: boolean
  frequency?: ScheduleFrequency
  time?: string
  dayOfWeek?: number
  retention?: number
}

const DEFAULT_TIME = '03:00'

function schedulerRoot() {
  return path.resolve(process.env.APEXGSP_SCHEDULER_ROOT || '/opt/apexgsp/schedules')
}

function schedulesPath() {
  return path.join(schedulerRoot(), 'backup-schedules.json')
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function readPayload(payload: unknown): SchedulePayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Missing schedule payload')
  return payload as SchedulePayload
}

function readServerPayload(payload: unknown) {
  const input = readPayload(payload)
  const serverId = input.server_id
  const installPath = input.installPath || input.install_path
  if (!serverId) throw new Error('Missing server_id')
  if (!installPath) throw new Error('Missing installPath')
  return { serverId, installPath, input }
}

function parseTime(value?: string) {
  const time = value || DEFAULT_TIME
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (!match) throw new Error('Schedule time must use HH:mm format')
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) throw new Error('Schedule time is invalid')
  return { time, hour, minute }
}

function addPeriod(date: Date, frequency: ScheduleFrequency) {
  const next = new Date(date)
  if (frequency === 'hourly') next.setHours(next.getHours() + 1)
  if (frequency === 'daily') next.setDate(next.getDate() + 1)
  if (frequency === 'weekly') next.setDate(next.getDate() + 7)
  return next
}

function computeNextRun(input: Pick<BackupSchedule, 'frequency' | 'time' | 'dayOfWeek'>, from = new Date()) {
  const { hour, minute } = parseTime(input.time)
  const next = new Date(from)
  next.setSeconds(0, 0)

  if (input.frequency === 'hourly') {
    next.setMinutes(minute, 0, 0)
    if (next <= from) next.setHours(next.getHours() + 1)
    return next.toISOString()
  }

  next.setHours(hour, minute, 0, 0)

  if (input.frequency === 'daily') {
    if (next <= from) next.setDate(next.getDate() + 1)
    return next.toISOString()
  }

  const targetDay = Number.isInteger(input.dayOfWeek) ? Number(input.dayOfWeek) : 0
  const daysAhead = (targetDay - next.getDay() + 7) % 7
  next.setDate(next.getDate() + daysAhead)
  if (next <= from) next.setDate(next.getDate() + 7)
  return next.toISOString()
}

async function readSchedules(): Promise<BackupSchedule[]> {
  const filePath = schedulesPath()
  if (!(await exists(filePath))) return []
  const text = await fs.readFile(filePath, 'utf8')
  const parsed = JSON.parse(text) as BackupSchedule[]
  return Array.isArray(parsed) ? parsed : []
}

async function writeSchedules(schedules: BackupSchedule[]) {
  await fs.mkdir(schedulerRoot(), { recursive: true })
  await fs.writeFile(schedulesPath(), `${JSON.stringify(schedules, null, 2)}\n`, 'utf8')
}

function cleanName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 80)
}

function newId(serverId: string, mode: BackupMode) {
  return `${cleanName(serverId)}-${mode}-${Date.now().toString(36)}`
}

function normaliseSchedule(input: SchedulePayload, existing?: BackupSchedule): BackupSchedule {
  const serverId = input.server_id || existing?.serverId
  const installPath = input.installPath || input.install_path || existing?.installPath
  if (!serverId) throw new Error('Missing server_id')
  if (!installPath) throw new Error('Missing installPath')

  const frequency = input.frequency || existing?.frequency || 'daily'
  if (!['hourly', 'daily', 'weekly'].includes(frequency)) throw new Error('Invalid schedule frequency')

  const backupMode = input.backupMode === 'full' ? 'full' : input.backupMode === 'world' ? 'world' : existing?.backupMode || 'world'
  const { time } = parseTime(input.time || existing?.time || DEFAULT_TIME)
  const retention = Math.max(1, Math.min(100, Number(input.retention ?? existing?.retention ?? 7)))
  const dayOfWeek = Math.max(0, Math.min(6, Number(input.dayOfWeek ?? existing?.dayOfWeek ?? 0)))
  const now = new Date().toISOString()

  const next: BackupSchedule = {
    id: existing?.id || newId(serverId, backupMode),
    serverId,
    serverName: input.serverName || existing?.serverName,
    installPath,
    backupMode,
    enabled: input.enabled ?? existing?.enabled ?? true,
    frequency,
    time,
    dayOfWeek,
    retention,
    lastRunAt: existing?.lastRunAt || null,
    nextRunAt: existing?.nextRunAt || computeNextRun({ frequency, time, dayOfWeek }),
    lastResult: existing?.lastResult || null,
    lastError: existing?.lastError || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }

  next.nextRunAt = computeNextRun(next)
  return next
}

async function pruneBackups(schedule: BackupSchedule, ctx?: JobContext) {
  const result = await listBackups({ server_id: schedule.serverId, installPath: schedule.installPath }) as { backups?: Array<{ name: string; mode?: string; status?: string; modifiedAt: string }> }
  const ready = (result.backups || [])
    .filter(backup => backup.status !== 'creating')
    .filter(backup => backup.mode === schedule.backupMode)
    .filter(backup => !backup.name.startsWith('pre-restore-'))
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))

  const remove = ready.slice(schedule.retention)
  for (const backup of remove) {
    await ctx?.reportProgress({ progress: 90, message: `Pruning old backup ${backup.name}`, serverId: schedule.serverId, backupFile: backup.name })
    await fs.rm(path.join(process.env.APEXGSP_BACKUPS_ROOT || '/opt/apexgsp/backups', schedule.serverId, backup.name), { force: true })
  }
}

async function runSchedule(schedule: BackupSchedule, ctx?: JobContext) {
  await ctx?.reportProgress({ progress: 10, message: 'Starting scheduled backup', serverId: schedule.serverId, backupMode: schedule.backupMode })
  const backupName = `scheduled-${schedule.backupMode}-${new Date().toISOString().replaceAll(':', '-')}`
  const result = await createBackup({ server_id: schedule.serverId, installPath: schedule.installPath, backupMode: schedule.backupMode, backupName }, ctx)
  await pruneBackups(schedule, ctx)
  return result
}

export async function listSchedules(payload: unknown) {
  const { serverId } = readServerPayload(payload)
  const schedules = await readSchedules()
  return { message: 'Schedules loaded', serverId, schedules: schedules.filter(schedule => schedule.serverId === serverId) }
}

export async function saveSchedule(payload: unknown) {
  const input = readPayload(payload)
  const schedules = await readSchedules()
  const index = input.scheduleId ? schedules.findIndex(schedule => schedule.id === input.scheduleId) : -1
  const existing = index >= 0 ? schedules[index] : undefined
  const schedule = normaliseSchedule(input, existing)
  if (index >= 0) schedules[index] = schedule
  else schedules.push(schedule)
  await writeSchedules(schedules)
  return { message: 'Schedule saved', schedule }
}

export async function deleteSchedule(payload: unknown) {
  const input = readPayload(payload)
  if (!input.scheduleId) throw new Error('Missing scheduleId')
  const schedules = await readSchedules()
  await writeSchedules(schedules.filter(schedule => schedule.id !== input.scheduleId))
  return { message: 'Schedule deleted', scheduleId: input.scheduleId }
}

export async function runScheduleNow(payload: unknown, ctx?: JobContext) {
  const input = readPayload(payload)
  if (!input.scheduleId) throw new Error('Missing scheduleId')
  const schedules = await readSchedules()
  const index = schedules.findIndex(schedule => schedule.id === input.scheduleId)
  if (index === -1) throw new Error('Schedule not found')
  const schedule = schedules[index]
  const now = new Date()
  const result = await runSchedule(schedule, ctx)
  schedules[index] = { ...schedule, lastRunAt: now.toISOString(), nextRunAt: computeNextRun(schedule, addPeriod(now, schedule.frequency)), lastResult: 'completed', lastError: null, updatedAt: new Date().toISOString() }
  await writeSchedules(schedules)
  return { message: 'Scheduled backup started', schedule: schedules[index], result }
}

let schedulerRunning = false

async function tick(log: (message: string) => void) {
  if (schedulerRunning) return
  schedulerRunning = true
  try {
    const now = new Date()
    const schedules = await readSchedules()
    let changed = false
    for (let i = 0; i < schedules.length; i++) {
      const schedule = schedules[i]
      if (!schedule.enabled || new Date(schedule.nextRunAt) > now) continue
      try {
        log(`Running scheduled ${schedule.backupMode} backup for ${schedule.serverId}`)
        await runSchedule(schedule)
        schedules[i] = { ...schedule, lastRunAt: now.toISOString(), nextRunAt: computeNextRun(schedule, addPeriod(now, schedule.frequency)), lastResult: 'completed', lastError: null, updatedAt: new Date().toISOString() }
      } catch (error) {
        schedules[i] = { ...schedule, lastRunAt: now.toISOString(), nextRunAt: computeNextRun(schedule, addPeriod(now, schedule.frequency)), lastResult: 'failed', lastError: (error as Error).message, updatedAt: new Date().toISOString() }
        log(`Scheduled backup failed for ${schedule.serverId}: ${(error as Error).message}`)
      }
      changed = true
    }
    if (changed) await writeSchedules(schedules)
  } finally {
    schedulerRunning = false
  }
}

export function startScheduler(log: (message: string) => void) {
  const intervalMs = Number(process.env.APEXGSP_SCHEDULER_INTERVAL_MS || 60000)
  log(`Backup scheduler enabled, interval ${intervalMs}ms`)
  void tick(log).catch(error => log(`Scheduler tick failed: ${(error as Error).message}`))
  return setInterval(() => void tick(log).catch(error => log(`Scheduler tick failed: ${(error as Error).message}`)), intervalMs)
}
