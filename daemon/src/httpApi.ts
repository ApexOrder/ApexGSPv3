import http from 'node:http'
import { URL } from 'node:url'
import type { DaemonConfig } from './config.js'
import { createBackup, deleteBackup, listBackups, restoreBackup } from './jobs/backups.js'
import { updateServerConfig } from './jobs/config.js'
import { refreshServerStatus, restartServer, startServer, stopServer } from './jobs/manageServer.js'
import { getServerLogs } from './jobs/serverConsole.js'
import { getServerMetrics } from './jobs/serverMetrics.js'
import { deleteSchedule, listSchedules, runScheduleNow, saveSchedule } from './scheduler.js'
import { getServerTime } from './serverTime.js'

type ApiHandler = (payload: Record<string, unknown>) => Promise<unknown>

function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk
      if (body.length > 1024 * 1024) reject(new Error('Request body too large'))
    })
    req.on('end', () => {
      if (!body.trim()) return resolve({})
      try {
        resolve(JSON.parse(body) as Record<string, unknown>)
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: http.ServerResponse, statusCode: number, data: unknown) {
  res.writeHead(statusCode, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,x-apexgsp-node-id,x-apexgsp-node-secret',
  })
  res.end(JSON.stringify(data))
}

function isAuthed(req: http.IncomingMessage, config: DaemonConfig) {
  const nodeId = req.headers['x-apexgsp-node-id']
  const nodeSecret = req.headers['x-apexgsp-node-secret']
  return nodeId === config.nodeId && nodeSecret === config.nodeSecret
}

async function handleAction(req: http.IncomingMessage, res: http.ServerResponse, config: DaemonConfig, handler: ApiHandler) {
  if (!isAuthed(req, config)) return sendJson(res, 401, { success: false, error: 'Unauthorized' })

  try {
    const payload = await readJson(req)
    const result = await handler(payload)
    sendJson(res, 200, { success: true, result })
  } catch (error) {
    sendJson(res, 500, { success: false, error: (error as Error).message })
  }
}

export function startHttpApi(config: DaemonConfig, log: (message: string) => void) {
  const port = Number(process.env.APEXGSP_DAEMON_API_PORT || 8787)
  const host = process.env.APEXGSP_DAEMON_API_HOST || '127.0.0.1'

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return sendJson(res, 204, {})

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

    if (url.pathname === '/health') return sendJson(res, 200, { success: true, nodeId: config.nodeId })
    if (req.method !== 'POST') return sendJson(res, 405, { success: false, error: 'Method not allowed' })

    const routes: Record<string, ApiHandler> = {
      '/api/server/status': payload => refreshServerStatus(payload),
      '/api/server/start': payload => startServer(payload),
      '/api/server/stop': payload => stopServer(payload),
      '/api/server/restart': payload => restartServer(payload),
      '/api/server/logs': payload => getServerLogs(payload),
      '/api/server/metrics': payload => getServerMetrics(payload),
      '/api/server/config': payload => updateServerConfig(payload),
      '/api/server/backups/list': payload => listBackups(payload),
      '/api/server/backups/create': payload => createBackup(payload),
      '/api/server/backups/delete': payload => deleteBackup(payload),
      '/api/server/backups/restore': payload => restoreBackup(payload),
      '/api/server/backups/restore/world': payload => restoreBackup({ ...payload, backupMode: 'world' }),
      '/api/server/backups/restore/full': payload => restoreBackup({ ...payload, backupMode: 'full' }),
      '/api/server/schedules/list': payload => listSchedules(payload),
      '/api/server/schedules/save': payload => saveSchedule(payload),
      '/api/server/schedules/delete': payload => deleteSchedule(payload),
      '/api/server/schedules/run': payload => runScheduleNow(payload),
      '/api/server/schedules/time': payload => getServerTime(),
    }

    const handler = routes[url.pathname]
    if (!handler) return sendJson(res, 404, { success: false, error: 'Not found' })
    return handleAction(req, res, config, handler)
  })

  server.listen(port, host, () => log(`Daemon HTTP API listening on ${host}:${port}`))
  server.on('error', error => log(`Daemon HTTP API failed: ${(error as Error).message}`))
  return server
}
