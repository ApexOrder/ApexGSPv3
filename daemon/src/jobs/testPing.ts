import os from 'node:os'

export async function testPing() {
  return {
    message: `Pong from ${os.hostname()}`,
    hostname: os.hostname(),
  }
}
