import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = __dirname
const distDir = path.join(rootDir, 'dist')
const port = Number(process.env.PORT || 5173)
const host = process.env.HOST || '0.0.0.0'

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const env = {}
  const text = fs.readFileSync(filePath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index === -1) continue
    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '')
    env[key] = value
    if (!process.env[key]) process.env[key] = value
  }
  return env
}

loadEnvFile(path.join(rootDir, '.env'))

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json' })
  res.end(JSON.stringify(payload))
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk
      if (body.length > 70 * 1024 * 1024) reject(new Error('Request body too large'))
    })
    req.on('end', () => {
      if (!body.trim()) return resolve({})
      try { resolve(JSON.parse(body)) } catch { reject(new Error('Invalid JSON body')) }
    })
    req.on('error', reject)
  })
}

async function validateUser(req) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : ''
  if (!token) return false
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) return false
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, { headers: { apikey: anonKey, authorization: `Bearer ${token}` } })
  return response.ok
}

function getDaemonEnv() {
  const envPath = process.env.APEXGSP_DAEMON_ENV_PATH || '/opt/apexgsp-daemon/.env'
  return loadEnvFile(envPath)
}

function getDaemonPath(action) {
  const directActions = {
    backup_list: '/api/server/backups/list',
    backup_create: '/api/server/backups/create',
    backup_delete: '/api/server/backups/delete',
    backup_restore: '/api/server/backups/restore',
    backup_restore_world: '/api/server/backups/restore/world',
    backup_restore_full: '/api/server/backups/restore/full',
    workshop_list: '/api/server/workshop/list',
    workshop_save: '/api/server/workshop/save',
    workshop_update: '/api/server/workshop/update',
    mods_list: '/api/server/mods/list',
    mods_install_url: '/api/server/mods/install-url',
    mods_install_upload: '/api/server/mods/install-upload',
    mods_remove: '/api/server/mods/remove',
    schedule_list: '/api/server/schedules/list',
    schedule_save: '/api/server/schedules/save',
    schedule_delete: '/api/server/schedules/delete',
    schedule_run: '/api/server/schedules/run',
    schedule_time: '/api/server/schedules/time',
  }
  if (directActions[action]) return directActions[action]
  return `/api/server/${action}`
}

async function proxyDaemon(req, res, action) {
  const allowed = new Set(['status', 'start', 'stop', 'restart', 'logs', 'metrics', 'config', 'backup_list', 'backup_create', 'backup_delete', 'backup_restore', 'backup_restore_world', 'backup_restore_full', 'workshop_list', 'workshop_save', 'workshop_update', 'mods_list', 'mods_install_url', 'mods_install_upload', 'mods_remove', 'schedule_list', 'schedule_save', 'schedule_delete', 'schedule_run', 'schedule_time'])
  if (!allowed.has(action)) return sendJson(res, 404, { success: false, error: 'Unknown direct action' })
  if (!(await validateUser(req))) return sendJson(res, 401, { success: false, error: 'Unauthorized' })
  const payload = await readJson(req)
  const daemonEnv = getDaemonEnv()
  const nodeId = daemonEnv.APEXGSP_NODE_ID || process.env.APEXGSP_NODE_ID
  const nodeSecret = daemonEnv.APEXGSP_NODE_SECRET || process.env.APEXGSP_NODE_SECRET
  const daemonUrl = process.env.APEXGSP_DAEMON_URL || 'http://127.0.0.1:8787'
  if (!nodeId || !nodeSecret) return sendJson(res, 500, { success: false, error: 'Daemon credentials missing on panel server' })
  const response = await fetch(`${daemonUrl.replace(/\/$/, '')}${getDaemonPath(action)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-apexgsp-node-id': nodeId, 'x-apexgsp-node-secret': nodeSecret },
    body: JSON.stringify(payload),
  })
  const text = await response.text()
  res.writeHead(response.status, { 'content-type': response.headers.get('content-type') || 'application/json' })
  res.end(text)
}

function decodeHtml(value) {
  return String(value || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
}

function parseWorkshopIds(html) {
  const ids = new Set()
  const patterns = [/sharedfile_(\d+)/g, /sharedfiles\/filedetails\/\?id=(\d+)/g, /filedetails\/\?id=(\d+)/g, /data-publishedfileid="(\d+)"/g]
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(html)) && ids.size < 48) ids.add(match[1])
  }
  return [...ids]
}

async function getWorkshopDetails(ids) {
  const unique = [...new Set(ids.map(id => String(id).replace(/\D/g, '')).filter(Boolean))].slice(0, 50)
  if (!unique.length) return []
  const params = new URLSearchParams()
  params.set('itemcount', String(unique.length))
  unique.forEach((id, index) => params.set(`publishedfileids[${index}]`, id))
  const response = await fetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'ApexGSP Workshop Catalogue' },
    body: params.toString(),
  })
  if (!response.ok) return []
  const data = await response.json().catch(() => null)
  const details = data?.response?.publishedfiledetails || []
  return details.map(item => ({ id: String(item.publishedfileid || ''), title: decodeHtml(item.title || `Workshop ${item.publishedfileid}`), image: item.preview_url || '', author: item.creator ? `Creator ${item.creator}` : '', stats: item.subscriptions ? `${item.subscriptions} subscribers` : '', url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${item.publishedfileid}` })).filter(item => item.id && item.title)
}

async function fetchWorkshopAjaxCatalogue({ appId, query, sort, page }) {
  const count = 30
  const start = Math.max(0, (page - 1) * count)
  const params = new URLSearchParams()
  params.set('appid', appId); params.set('query', query); params.set('start', String(start)); params.set('count', String(count)); params.set('section', 'readytouseitems'); params.set('browsefilter', sort); params.set('days', '-1'); params.set('actualsort', sort); params.set('l', 'english')
  const response = await fetch('https://steamcommunity.com/sharedfiles/ajaxgetworkshopitems/render/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'user-agent': 'Mozilla/5.0 ApexGSP Workshop Catalogue', accept: 'application/json, text/javascript, */*; q=0.01' }, body: params.toString() })
  if (!response.ok) return []
  const data = await response.json().catch(() => null)
  return parseWorkshopIds(data?.results_html || data?.html || '')
}

async function fetchWorkshopBrowseCatalogue({ appId, query, sort, page }) {
  const steamUrl = new URL('https://steamcommunity.com/workshop/browse/')
  steamUrl.searchParams.set('appid', appId); steamUrl.searchParams.set('browsesort', sort); steamUrl.searchParams.set('section', 'readytouseitems'); steamUrl.searchParams.set('actualsort', sort); steamUrl.searchParams.set('p', String(page)); if (query) steamUrl.searchParams.set('searchtext', query)
  const response = await fetch(steamUrl, { headers: { 'user-agent': 'Mozilla/5.0 ApexGSP Workshop Catalogue', accept: 'text/html,application/xhtml+xml' } })
  if (!response.ok) return []
  return parseWorkshopIds(await response.text())
}

async function searchWorkshop(req, res) {
  if (!(await validateUser(req))) return sendJson(res, 401, { success: false, error: 'Unauthorized' })
  const payload = await readJson(req)
  const appId = String(payload.appId || '251570').replace(/\D/g, '') || '251570'
  const query = String(payload.query || '').trim()
  const sort = String(payload.sort || 'trend')
  const page = Math.max(1, Math.min(50, Number(payload.page || 1)))
  let ids = []
  if (/^\d{5,20}$/.test(query)) ids = [query]
  if (!ids.length) ids = await fetchWorkshopAjaxCatalogue({ appId, query, sort, page })
  if (!ids.length) ids = await fetchWorkshopBrowseCatalogue({ appId, query, sort, page })
  const items = await getWorkshopDetails(ids)
  return sendJson(res, 200, { success: true, result: { appId, query, sort, page, items, debug: { ids: ids.length, details: items.length, source: ids.length ? 'steam-workshop' : 'none' } } })
}

const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon' }

function serveStatic(req, res) {
  const url = new URL(req.url || '/', 'http://localhost')
  const requested = decodeURIComponent(url.pathname)
  const safePath = requested === '/' ? '/index.html' : requested
  let filePath = path.resolve(distDir, `.${safePath}`)
  if (!filePath.startsWith(`${distDir}${path.sep}`)) { res.writeHead(403); return res.end('Forbidden') }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath = path.join(distDir, 'index.html')
  const ext = path.extname(filePath)
  res.writeHead(200, { 'content-type': mimeTypes[ext] || 'application/octet-stream' })
  fs.createReadStream(filePath).pipe(res)
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost')
    if (req.method === 'POST' && url.pathname.startsWith('/api/direct/')) return proxyDaemon(req, res, url.pathname.split('/').pop())
    if (req.method === 'POST' && url.pathname === '/api/workshop/search') return searchWorkshop(req, res)
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end('Method not allowed') }
    return serveStatic(req, res)
  } catch (error) {
    return sendJson(res, 500, { success: false, error: error.message })
  }
})

server.listen(port, host, () => console.log(`ApexGSP panel listening on http://${host}:${port}`))
