import { hostname as osHostname } from 'node:os'
import type { DaemonConfig } from './config.js'
import { persistConfig } from './config.js'

export async function register(config: DaemonConfig): Promise<DaemonConfig> {
  if (!config.panelUrl) throw new Error('PANEL_URL is not set')
  if (!config.token) throw new Error('NODE_TOKEN is not set')

  const url = `${config.panelUrl.replace(/\/$/, '')}/functions/v1/node-api/register`

  let ipAddress: string | undefined
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(4000) })
    if (res.ok) ipAddress = ((await res.json()) as { ip: string }).ip
  } catch { /* best-effort */ }

  console.log(`[register] Contacting panel at ${url}`)

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: config.token,
      hostname: osHostname(),
      ip_address: ipAddress,
      daemon_version: '1.0.0',
    }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Registration failed (${res.status}): ${body}`)
  }

  const data = (await res.json()) as { success: boolean; node_id: string; node_secret: string }
  if (!data.success || !data.node_id || !data.node_secret) {
    throw new Error('Invalid registration response from panel')
  }

  console.log(`[register] Registered. Node ID: ${data.node_id}`)

  const updated: DaemonConfig = { ...config, nodeId: data.node_id, nodeSecret: data.node_secret, token: undefined }
  persistConfig(updated)
  return updated
}
