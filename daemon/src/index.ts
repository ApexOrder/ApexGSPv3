import os from 'node:os'
import { loadConfig, persistEnvValue } from './config.js'
import { completeJob, fetchNextJob, registerNode, reportJobProgress, sendHeartbeat } from './client.js'
import { startHttpApi } from './httpApi.js'
import { runJob } from './jobs/index.js'
import { startScheduler } from './scheduler.js'

const DAEMON_VERSION = '0.1.0-ts'

function log(message: string) {
  console.log(`[${new Date().toISOString()}] ${message}`)
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function ensureRegistered() {
  const config = loadConfig()

  if (config.nodeId && config.nodeSecret) {
    log(`Node already registered: ${config.nodeId}`)
    return config
  }

  if (!config.registrationToken) {
    throw new Error('Missing registration token and node is not already registered')
  }

  log('Registering node with ApexGSP...')
  const result = await registerNode(config, os.hostname(), DAEMON_VERSION)

  persistEnvValue(config.envPath, 'APEXGSP_NODE_ID', result.node_id)
  persistEnvValue(config.envPath, 'APEXGSP_NODE_SECRET', result.node_secret)

  const nextConfig = loadConfig()
  log(`Node registered: ${nextConfig.nodeId}`)
  return nextConfig
}

async function heartbeatLoop() {
  while (true) {
    const config = loadConfig()

    try {
      await sendHeartbeat(config, DAEMON_VERSION, { hostname: os.hostname() })
      log('Heartbeat sent.')
    } catch (error) {
      log(`Heartbeat failed: ${(error as Error).message}`)
    }

    await sleep(config.heartbeatIntervalMs)
  }
}

async function jobLoop() {
  while (true) {
    const config = loadConfig()

    try {
      const next = await fetchNextJob(config)

      if (next.job) {
        log(`Running job ${next.job.id}: ${next.job.type}`)

        try {
          const result = await runJob(next.job.type, next.job.payload, {
            reportProgress: async result => {
              await reportJobProgress(config, next.job!.id, result)
            },
          })
          await completeJob(config, next.job.id, 'completed', result)
          log(`Completed job ${next.job.id}: ${next.job.type}`)
        } catch (error) {
          const message = (error as Error).message
          await completeJob(config, next.job.id, 'failed', { message }, message)
          log(`Failed job ${next.job.id}: ${message}`)
        }
      }
    } catch (error) {
      log(`Job poll failed: ${(error as Error).message}`)
    }

    await sleep(config.jobPollIntervalMs)
  }
}

async function main() {
  const config = await ensureRegistered()
  startHttpApi(config, log)
  startScheduler(log)
  await Promise.all([heartbeatLoop(), jobLoop()])
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
