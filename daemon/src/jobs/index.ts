import { testPing } from './testPing.js'
import { detectTools } from './detectTools.js'
import { installSteamcmd } from './installSteamcmd.js'
import { createServer } from './createServer.js'
import { createBackup, deleteBackup, listBackups, restoreBackup } from './backups.js'
import { updateServerConfig } from './config.js'
import { createFolder, deletePath, listFiles, readFile, writeFile } from './fileManager.js'
import { refreshServerStatus, restartServer, startServer, stopServer } from './manageServer.js'
import { getServerLogs } from './serverConsole.js'

export interface JobContext {
  reportProgress: (result: Record<string, unknown>) => Promise<void>
}

export async function runJob(type: string, payload: unknown, ctx?: JobContext) {
  switch (type) {
    case 'test_ping':
      return testPing()
    case 'detect_tools':
      return detectTools()
    case 'install_steamcmd':
      return installSteamcmd(payload, ctx)
    case 'create_server':
      return createServer(payload, ctx)
    case 'update_server_config':
      return updateServerConfig(payload, ctx)
    case 'list_backups':
      return listBackups(payload, ctx)
    case 'create_backup':
      return createBackup(payload, ctx)
    case 'delete_backup':
      return deleteBackup(payload, ctx)
    case 'restore_backup':
    case 'restore_world_backup':
    case 'restore_full_backup':
      return restoreBackup(payload, ctx)
    case 'list_files':
      return listFiles(payload, ctx)
    case 'read_file':
      return readFile(payload, ctx)
    case 'write_file':
      return writeFile(payload, ctx)
    case 'create_folder':
      return createFolder(payload, ctx)
    case 'delete_path':
      return deletePath(payload, ctx)
    case 'start_server':
      return startServer(payload, ctx)
    case 'stop_server':
      return stopServer(payload, ctx)
    case 'restart_server':
      return restartServer(payload, ctx)
    case 'refresh_server_status':
      return refreshServerStatus(payload, ctx)
    case 'get_server_logs':
      return getServerLogs(payload, ctx)
    default:
      throw new Error(`Unsupported job type: ${type}`)
  }
}
