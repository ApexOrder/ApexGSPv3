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
  timeZone?: string
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
  timeZone?: string
}

const DEFAULT_TIME = '03:00'
const DEFAULT_TZ = 'UTC'

function schedulerRoot() { return path.resolve(process.env.APEXGSP_SCHEDULER_ROOT || '/opt/apexgsp/schedules') }
function schedulesPath() { return path.join(schedulerRoot(), 'backup-schedules.json') }
function cleanName(value: string) { return value.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 80) }
function newId(serverId: string, mode: BackupMode) { return `${cleanName(serverId)}-${mode}-${Date.now().toString(36)}` }

async function exists(filePath: string) { try { await fs.access(filePath); return true } catch { return false } }
function readPayload(payload: unknown): SchedulePayload { if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Missing schedule payload'); return payload as SchedulePayload }
function readServerPayload(payload: unknown) { const input = readPayload(payload); const serverId = input.server_id; const installPath = input.installPath || input.install_path; if (!serverId) throw new Error('Missing server_id'); if (!installPath) throw new Error('Missing installPath'); return { serverId, installPath, input } }

function safeTimeZone(value?: string) {
  const zone = value?.trim() || process.env.APEXGSP_TIME_ZONE?.trim() || process.env.TZ?.trim() || DEFAULT_TZ
  try { new Intl.DateTimeFormat('en-GB', { timeZone: zone }).format(new Date()); return zone } catch { return DEFAULT_TZ }
}

function getOffsetLabel(timeZone: string, date = new Date()) {
  const part = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(date).find(item => item.type === 'timeZoneName')?.value || 'GMT+0'
  return part.replace('GMT', 'UTC')
}

function getDaemonTimeInfo(timeZone?: string) {
  const zone = safeTimeZone(timeZone)
  const now = new Date()
  return { iso: now.toISOString(), local: now.toLocaleString('en-GB', { timeZone: zone }), timeZone: zone, offset: getOffsetLabel(zone, now) }
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

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(date)
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value || 0)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') }
}

function zonedOffsetMs(date: Date, timeZone: string) {
  const p = zonedParts(date, timeZone)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime()
}

function zonedWallDate(timeZone: string, y: number, m: number, d: number, h: number, min: number) {
  const guess = new Date(Date.UTC(y, m - 1, d, h, min, 0))
  return new Date(guess.getTime() - zonedOffsetMs(guess, timeZone))
}

function addPeriod(date: Date, frequency: ScheduleFrequency) {
  const next = new Date(date)
  if (frequency === 'hourly') next.setUTCHours(next.getUTCHours() + 1)
  if (frequency === 'daily') next.setUTCDate(next.getUTCDate() + 1)
  if (frequency === 'weekly') next.setUTCDate(next.getUTCDate() + 7)
  return next
}

function computeNextRun(input: Pick<BackupSchedule, 'frequency' | 'time' | 'dayOfWeek' | 'timeZone'>, from = new Date()) {
  const timeZone = safeTimeZone(input.timeZone)
  const { hour, minute } = parseTime(input.time)
  const local = zonedParts(from, timeZone)

  if (input.frequency === 'hourly') {
    const next = zonedWallDate(timeZone, local.year, local.month, local.day, local.hour, minute)
    if (next <= from) return addPeriod(next, 'hourly').toISOString()
    return next.toISOString()
  }

  let next = zonedWallDate(timeZone, local.year, local.month, local.day, hour, minute)
  if (input.frequency === 'daily') {
    if (next <= from) next = addPeriod(next, 'daily')
    return next.toISOString()
  }

  const targetDay = Number.isInteger(input.dayOfWeek) ? Number(input.dayOfWeek) : 0
  let daysAhead = (targetDay - new Date(zonedWallDate(timeZone, local.year, local.month, local.day, 12, 0)).getUTCDay() + 7) % 7
  next = zonedWallDate(timeZone, local.year, local.month, local.day + daysAhead, hour, minute)
  if (next <= from) next = addPeriod(next, 'weekly')
  return next.toISOString()
}

async function readSchedules(): Promise<BackupSchedule[]> { const filePath = schedulesPath(); if (!(await exists(filePath))) return []; const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as BackupSchedule[]; return Array.isArray(parsed) ? parsed : [] }
async function writeSchedules(schedules: BackupSchedule[]) { await fs.mkdir(schedulerRoot(), { recursive: true }); await fs.writeFile(schedulesPath(), `${JSON.stringify(schedules, null, 2)}\n`, 'utf8') }

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
  const timeZone = safeTimeZone(input.timeZone || existing?.timeZone)
  const now = new Date().toISOString()
  const schedule: BackupSchedule = { id: existing?.id || newId(serverId, backupMode), serverId, serverName: input.serverName || existing?.serverName, installPath, backupMode, enabled: input.enabled ?? existing?.enabled ?? true, frequency, time, dayOfWeek, retention, timeZone, lastRunAt: existing?.lastRunAt || null, nextRunAt: '', lastResult: existing?.lastResult || null, lastError: existing?.lastError || null, createdAt: existing?.createdAt || now, updatedAt: now }
  schedule.nextRunAt = computeNextRun(schedule)
  return schedule
}

async function pruneBackups(schedule: BackupSchedule, ctx?: JobContext) {
  const result = await listBackups({ server_id: schedule.serverId, installPath: schedule.installPath }) as { backups?: Array<{ name: string; mode?: string; status?: string; modifiedAt: string }> }
  const ready = (result.backups || []).filter(backup => backup.status !== 'creating').filter(backup => backup.mode === schedule.backupMode).filter(backup => !backup.name.startsWith('pre-restore-')).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
  for (const backup of ready.slice(schedule.retention)) { await ctx?.reportProgress({ progress: 90, message: `Pruning old backup ${backup.name}`, serverId: schedule.serverId, backupFile: backup.name }); await fs.rm(path.join(process.env.APEXGSP_BACKUPS_ROOT || '/opt/apexgsp/backups', schedule.serverId, backup.name), { force: true }) }
}

async function runSchedule(schedule: BackupSchedule, ctx?: JobContext) { await ctx?.reportProgress({ progress: 10, message: 'Starting scheduled backup', serverId: schedule.serverId, backupMode: schedule.backupMode }); const backupName = `scheduled-${schedule.backupMode}-${new Date().toISOString().replaceAll(':', '-')}`; const result = await createBackup({ server_id: schedule.serverId, installPath: schedule.installPath, backupMode: schedule.backupMode, backupName }, ctx); await pruneBackups(schedule, ctx); return result }

export async function listSchedules(payload: unknown) { const { serverId, input } = readServerPayload(payload); const schedules = await readSchedules(); return { message: 'Schedules loaded', serverId, daemonTime: getDaemonTimeInfo(input.timeZone), schedules: schedules.filter(schedule => schedule.serverId === serverId) } }
export async function saveSchedule(payload: unknown) { const input = readPayload(payload); const schedules = await readSchedules(); const index = input.scheduleId ? schedules.findIndex(schedule => schedule.id === input.scheduleId) : -1; const schedule = normaliseSchedule(input, index >= 0 ? schedules[index] : undefined); if (index >= 0) schedules[index] = schedule; else schedules.push(schedule); await writeSchedules(schedules); return { message: 'Schedule saved', schedule, daemonTime: getDaemonTimeInfo(schedule.timeZone) } }
export async function deleteSchedule(payload: unknown) { const input = readPayload(payload); if (!input.scheduleId) throw new Error('Missing scheduleId'); const schedules = await readSchedules(); const nextSchedules = schedules.filter(schedule => schedule.id !== input.scheduleId); if (nextSchedules.length === schedules.length) throw new Error('Schedule not found'); await writeSchedules(nextSchedules); return { message: 'Schedule deleted', scheduleId: input.scheduleId, daemonTime: getDaemonTimeInfo(input.timeZone) } }
export async function runScheduleNow(payload: unknown, ctx?: JobContext) { const input = readPayload(payload); if (!input.scheduleId) throw new Error('Missing scheduleId'); const schedules = await readSchedules(); const index = schedules.findIndex(schedule => schedule.id === input.scheduleId); if (index === -1) throw new Error('Schedule not found'); const schedule = schedules[index]; const now = new Date(); const result = await runSchedule(schedule, ctx); schedules[index] = { ...schedule, lastRunAt: now.toISOString(), nextRunAt: computeNextRun(schedule, addPeriod(now, schedule.frequency)), lastResult: 'completed', lastError: null, updatedAt: new Date().toISOString() }; await writeSchedules(schedules); return { message: 'Scheduled backup started', schedule: schedules[index], result, daemonTime: getDaemonTimeInfo(schedule.timeZone) } }

let schedulerRunning = false
async function tick(log: (message: string) => void) { if (schedulerRunning) return; schedulerRunning = true; try { const now = new Date(); const schedules = await readSchedules(); let changed = false; for (let i = 0; i < schedules.length; i++) { const schedule = schedules[i]; if (!schedule.enabled || new Date(schedule.nextRunAt) > now) continue; try { log(`Running scheduled ${schedule.backupMode} backup for ${schedule.serverId}`); await runSchedule(schedule); schedules[i] = { ...schedule, lastRunAt: now.toISOString(), nextRunAt: computeNextRun(schedule, addPeriod(now, schedule.frequency)), lastResult: 'completed', lastError: null, updatedAt: new Date().toISOString() } } catch (error) { schedules[i] = { ...schedule, lastRunAt: now.toISOString(), nextRunAt: computeNextRun(schedule, addPeriod(now, schedule.frequency)), lastResult: 'failed', lastError: (error as Error).message, updatedAt: new Date().toISOString() }; log(`Scheduled backup failed for ${schedule.serverId}: ${(error as Error).message}`) } changed = true } if (changed) await writeSchedules(schedules) } finally { schedulerRunning = false } }
export function startScheduler(log: (message: string) => void) { const intervalMs = Number(process.env.APEXGSP_SCHEDULER_INTERVAL_MS || 60000); log(`Backup scheduler enabled, interval ${intervalMs}ms`); void tick(log).catch(error => log(`Scheduler tick failed: ${(error as Error).message}`)); return setInterval(() => void tick(log).catch(error => log(`Scheduler tick failed: ${(error as Error).message}`)), intervalMs) }
