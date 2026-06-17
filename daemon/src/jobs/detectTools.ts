import os from 'node:os'
import { runCommand } from '../utils/exec.js'

async function firstLine(command: string, args: string[]) {
  const result = await runCommand(command, args)
  if (!result.ok) return null
  return result.stdout.split('\n')[0] || null
}

async function isCommandAvailable(command: string) {
  const result = await runCommand('which', [command])
  return result.ok ? result.stdout : null
}

export async function detectTools() {
  const dockerPath = await isCommandAvailable('docker')
  const steamcmdPath = await isCommandAvailable('steamcmd')
  const nodePath = await isCommandAvailable('node')
  const npmPath = await isCommandAvailable('npm')
  const df = await runCommand('df', ['-k', '/'])
  const diskLine = df.stdout.split('\n')[1]?.trim().split(/\s+/) ?? []

  return {
    message: 'Tool detection complete',
    hostname: os.hostname(),
    os: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      type: os.type(),
    },
    disk: {
      mount: '/',
      totalKb: Number(diskLine[1] || 0),
      usedKb: Number(diskLine[2] || 0),
      freeKb: Number(diskLine[3] || 0),
    },
    tools: {
      docker: {
        installed: Boolean(dockerPath),
        path: dockerPath,
        version: dockerPath ? await firstLine('docker', ['--version']) : null,
      },
      dockerCompose: {
        installed: Boolean(dockerPath),
        version: dockerPath ? await firstLine('docker', ['compose', 'version']) : null,
      },
      steamcmd: {
        installed: Boolean(steamcmdPath),
        path: steamcmdPath,
      },
      node: {
        installed: Boolean(nodePath),
        path: nodePath,
        version: nodePath ? await firstLine('node', ['--version']) : null,
      },
      npm: {
        installed: Boolean(npmPath),
        path: npmPath,
        version: npmPath ? await firstLine('npm', ['--version']) : null,
      },
    },
  }
}
