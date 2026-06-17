import { testPing } from './testPing.js'
import { detectTools } from './detectTools.js'

export async function runJob(type: string, payload: unknown) {
  switch (type) {
    case 'test_ping':
      return testPing()
    case 'detect_tools':
      return detectTools()
    default:
      throw new Error(`Unsupported job type: ${type}`)
  }
}
