import { runCommand } from '../utils/exec.js'
import type { JobContext } from './index.js'

const KNOWN_STEAMCMD_PATHS = [
  '/usr/games/steamcmd',
  '/usr/bin/steamcmd',
  '/usr/local/bin/steamcmd',
]

async function report(ctx: JobContext | undefined, progress: number, message: string, extra: Record<string, unknown> = {}) {
  await ctx?.reportProgress({
    progress,
    message,
    ...extra,
  })
}

async function commandOutput(command: string, args: string[] = [], timeoutMs = 10_000) {
  const result = await runCommand(command, args, timeoutMs)
  return result.ok ? result.stdout.trim() : null
}

async function findSteamcmdPath() {
  const fromWhich = await commandOutput('which', ['steamcmd'])
  if (fromWhich) return fromWhich.split('\n')[0]

  for (const path of KNOWN_STEAMCMD_PATHS) {
    const exists = await runCommand('test', ['-x', path])
    if (exists.ok) return path
  }

  return null
}

async function getSteamcmdVersion(path: string) {
  const result = await runCommand(path, ['+quit'], 60_000)
  const output = `${result.stdout}\n${result.stderr}`.trim()
  const versionLine = output
    .split('\n')
    .map(line => line.trim())
    .find(line => /steam console client|steamcmd|version/i.test(line))

  return versionLine ?? output.split('\n')[0] ?? null
}

async function runPrivilegedBash(script: string, timeoutMs = 120_000) {
  const uid = typeof process.getuid === 'function' ? process.getuid() : null

  if (uid === 0) {
    return runCommand('bash', ['-lc', script], timeoutMs)
  }

  const sudoPath = await commandOutput('which', ['sudo'])
  if (!sudoPath) {
    return {
      ok: false,
      stdout: '',
      stderr: 'SteamCMD installation requires root or passwordless sudo. Re-run the daemon as root or configure sudo.',
      error: 'Missing sudo/root permissions',
    }
  }

  return runCommand('sudo', ['bash', '-lc', script], timeoutMs)
}

async function ensureI386Architecture(ctx?: JobContext) {
  const architectures = await commandOutput('dpkg', ['--print-foreign-architectures'])

  if (architectures?.split('\n').includes('i386')) {
    await report(ctx, 25, 'i386 architecture already enabled')
    return
  }

  await report(ctx, 20, 'Enabling i386 architecture')
  const result = await runPrivilegedBash('dpkg --add-architecture i386', 30_000)
  if (!result.ok) {
    throw new Error(`Failed to enable i386 architecture: ${result.stderr || result.error}`)
  }
}

async function installPackages(ctx?: JobContext) {
  await report(ctx, 35, 'Updating apt package lists')
  const update = await runPrivilegedBash('apt-get update', 180_000)
  if (!update.ok) throw new Error(`apt-get update failed: ${update.stderr || update.error}`)

  await report(ctx, 50, 'Installing Ubuntu dependencies and SteamCMD')
  const installScript = [
    'set -e',
    'echo "steam steam/question select I AGREE" | debconf-set-selections',
    'echo "steam steam/license note" | debconf-set-selections',
    'apt-get install -y software-properties-common',
    'add-apt-repository -y multiverse || true',
    'apt-get update',
    'DEBIAN_FRONTEND=noninteractive apt-get install -y lib32gcc-s1 steamcmd',
  ].join('\n')

  const install = await runPrivilegedBash(installScript, 300_000)
  if (!install.ok) throw new Error(`SteamCMD install failed: ${install.stderr || install.error}`)
}

export async function installSteamcmd(_payload: unknown, ctx?: JobContext) {
  await report(ctx, 5, 'Checking for existing SteamCMD installation')

  const existingPath = await findSteamcmdPath()
  if (existingPath) {
    await report(ctx, 80, 'SteamCMD already installed', { path: existingPath })
    const version = await getSteamcmdVersion(existingPath)

    return {
      message: 'SteamCMD already installed',
      installed: true,
      alreadyInstalled: true,
      path: existingPath,
      version,
    }
  }

  await report(ctx, 15, 'SteamCMD not found, preparing Ubuntu install')
  await ensureI386Architecture(ctx)
  await installPackages(ctx)

  await report(ctx, 85, 'Verifying SteamCMD installation')
  const path = await findSteamcmdPath()
  if (!path) {
    throw new Error('SteamCMD installation completed but steamcmd was not found on PATH or known install locations')
  }

  const version = await getSteamcmdVersion(path)
  await report(ctx, 100, 'SteamCMD installed and verified', { path, version })

  return {
    message: 'SteamCMD installed and verified',
    installed: true,
    alreadyInstalled: false,
    path,
    version,
  }
}
