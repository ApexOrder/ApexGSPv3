import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface ExecResult {
  ok: boolean
  stdout: string
  stderr: string
  error?: string
}

export async function runCommand(command: string, args: string[] = [], timeoutMs = 10_000): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    })

    return {
      ok: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    }
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string }
    return {
      ok: false,
      stdout: err.stdout?.trim() ?? '',
      stderr: err.stderr?.trim() ?? '',
      error: err.message,
    }
  }
}
