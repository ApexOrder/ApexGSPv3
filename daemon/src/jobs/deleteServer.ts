import fs from 'node:fs/promises'
import path from 'node:path'

type DeleteServerPayload = {
  server_id?: string
  installPath?: string
  install_path?: string
}

function readPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Missing delete server payload')
  const input = payload as DeleteServerPayload
  const serverId = input.server_id
  const installPath = input.installPath || input.install_path
  if (!serverId) throw new Error('Missing server_id')
  if (!installPath) throw new Error('Missing installPath')
  return { serverId, installPath }
}

function safeInstallPath(value: string) {
  const root = path.resolve(process.env.APEXGSP_SERVERS_ROOT || '/opt/apexgsp/servers')
  const resolved = path.resolve(value)
  if (resolved === root) throw new Error('Refusing to delete the servers root')
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe install path: ${resolved}`)
  return resolved
}

export async function deleteServerFiles(payload: unknown) {
  const input = readPayload(payload)
  const installPath = safeInstallPath(input.installPath)
  await fs.rm(installPath, { recursive: true, force: true })
  return { message: 'Server files deleted', serverId: input.serverId, installPath }
}
