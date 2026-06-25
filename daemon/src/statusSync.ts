import fs from 'node:fs/promises'
import path from 'node:path'
import { runCommand } from './utils/exec.js'

export type ServerStatusReport = {
  installPath: string
  game: string
  status: 'running' | 'stopped'
  pid: number | null
}

async function exists(filePath: string) {
  try { await fs.access(filePath); return true } catch { return false }
}

async function detectGame(installPath: string) {
  if (await exists(path.join(installPath, 'DayZServer_x64.exe')) || await exists(path.join(installPath, 'serverDZ.cfg'))) return 'dayz'
  if (await exists(path.join(installPath, '7DaysToDieServer.x86_64')) || await exists(path.join(installPath, 'serverconfig.xml'))) return '7dtd'
  return 'unknown'
}

async function findPid(installPath: string, game: string) {
  const pattern = game === 'dayz' ? `${installPath}.+DayZServer` : game === '7dtd' ? `${installPath}.+7DaysToDieServer` : `${installPath}`
  const result = await runCommand('pgrep', ['-f', pattern])
  if (!result.ok || !result.stdout.trim()) return null
  const pid = Number(result.stdout.trim().split(/\s+/)[0])
  return Number.isFinite(pid) && pid > 0 ? pid : null
}

export async function collectServerStatuses(root = process.env.APEXGSP_SERVERS_ROOT || '/opt/apexgsp/servers'): Promise<ServerStatusReport[]> {
  const resolvedRoot = path.resolve(root)
  const entries = await fs.readdir(resolvedRoot, { withFileTypes: true }).catch(() => [])
  const reports: ServerStatusReport[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const installPath = path.join(resolvedRoot, entry.name)
    const game = await detectGame(installPath)
    if (game === 'unknown') continue
    const pid = await findPid(installPath, game)
    reports.push({ installPath, game, status: pid ? 'running' : 'stopped', pid })
  }

  return reports
}
