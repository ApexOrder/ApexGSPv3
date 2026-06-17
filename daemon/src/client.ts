import { postJson } from './utils/http.js'
import type { DaemonConfig } from './config.js'
import type { NextJobResult, RegisterResult } from './types.js'

export async function registerNode(config: DaemonConfig, hostname: string, daemonVersion: string) {
  return postJson<RegisterResult>(`${config.apiUrl}/register`, {
    token: config.registrationToken,
    hostname,
    daemon_version: daemonVersion,
  })
}

export async function sendHeartbeat(config: DaemonConfig, daemonVersion: string, metadata: Record<string, unknown>) {
  return postJson<{ success: boolean; timestamp: string }>(`${config.apiUrl}/heartbeat`, {
    node_id: config.nodeId,
    node_secret: config.nodeSecret,
    daemon_version: daemonVersion,
    metadata,
  })
}

export async function fetchNextJob(config: DaemonConfig) {
  return postJson<NextJobResult>(`${config.apiUrl}/jobs/next`, {
    node_id: config.nodeId,
    node_secret: config.nodeSecret,
  })
}

export async function completeJob(config: DaemonConfig, jobId: string, status: 'completed' | 'failed', result: unknown, error?: string) {
  return postJson<{ success: boolean }>(`${config.apiUrl}/jobs/complete`, {
    node_id: config.nodeId,
    node_secret: config.nodeSecret,
    job_id: jobId,
    status,
    result,
    error: error ?? null,
  })
}
