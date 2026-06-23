import type { Session } from '@supabase/supabase-js'

export type NodeAction = 'status' | 'start' | 'stop' | 'restart' | 'logs' | 'metrics' | 'config' | 'backup_list' | 'backup_create' | 'backup_delete' | 'backup_restore' | 'backup_restore_world' | 'backup_restore_full' | 'workshop_list' | 'workshop_save' | 'workshop_update' | 'mods_list' | 'mods_install_url' | 'mods_install_upload' | 'mods_remove' | 'schedule_list' | 'schedule_save' | 'schedule_run' | 'schedule_delete' | 'schedule_time'

export async function callNodeApi<T>(session: Session | null, action: NodeAction, payload: Record<string, unknown>): Promise<T> {
  if (!session?.access_token) throw new Error('Not authenticated')

  const response = await fetch(`/api/direct/${action}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json().catch(() => null) as { success?: boolean; result?: T; error?: string } | null
  if (!response.ok || !data?.success) throw new Error(data?.error || `Request failed: ${response.status}`)
  return data.result as T
}
