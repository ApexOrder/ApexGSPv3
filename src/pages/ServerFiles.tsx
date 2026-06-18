import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileText, Folder, RefreshCw, Save, Trash2, FolderPlus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { GameServer } from '@/lib/types'

type FileJobType = 'list_files' | 'read_file' | 'write_file' | 'create_folder' | 'delete_path'

type FileEntry = {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  modifiedAt: string
}

type FileJob = {
  id: string
  type: FileJobType
  status: 'pending' | 'running' | 'completed' | 'failed'
  payload: Record<string, unknown> | null
  result: Record<string, unknown> | null
  error: string | null
  created_at: string
}

type ServerWithNode = GameServer & {
  nodes?: { name: string | null; status: string | null } | null
}

type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

function getServerId(job: FileJob) {
  const value = job.payload?.server_id ?? job.result?.serverId
  return typeof value === 'string' ? value : null
}

function getRelativePath(job: FileJob) {
  const value = job.payload?.relativePath ?? job.result?.path
  return typeof value === 'string' ? value : ''
}

function getEntries(job: FileJob | null) {
  const entries = job?.result?.entries
  return Array.isArray(entries) ? entries as FileEntry[] : []
}

function getFileContent(job: FileJob | null) {
  const content = job?.result?.content
  return typeof content === 'string' ? content : ''
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
}

export default function ServerFiles() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [server, setServer] = useState<ServerWithNode | null>(null)
  const [jobs, setJobs] = useState<FileJob[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPath, setCurrentPath] = useState('')
  const [selectedPath, setSelectedPath] = useState('')
  const [editorContent, setEditorContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const lastAppliedReadJobId = useRef<string | null>(null)
  const lastHandledWriteJobId = useRef<string | null>(null)

  const serverJobs = useMemo(() => jobs.filter(job => getServerId(job) === id), [jobs, id])
  const latestListJob = serverJobs.find(job => job.type === 'list_files' && getRelativePath(job) === currentPath) ?? null
  const latestReadJob = serverJobs.find(job => job.type === 'read_file' && getRelativePath(job) === selectedPath) ?? null
  const latestWriteJob = serverJobs.find(job => job.type === 'write_file' && getRelativePath(job) === selectedPath) ?? null
  const entries = getEntries(latestListJob)

  async function fetchServer() {
    if (!user || !id) return
    const { data, error } = await supabase
      .from('servers')
      .select('*, nodes(name, status)')
      .eq('user_id', user.id)
      .eq('id', id)
      .maybeSingle()

    if (error) console.error(error)
    setServer((data ?? null) as ServerWithNode | null)
    setLoading(false)
  }

  async function fetchJobs() {
    if (!user) return
    const { data, error } = await supabase
      .from('jobs')
      .select('id, type, status, payload, result, error, created_at')
      .eq('user_id', user.id)
      .in('type', ['list_files', 'read_file', 'write_file', 'create_folder', 'delete_path'])
      .order('created_at', { ascending: false })
      .limit(80)

    if (error) console.error(error)
    setJobs((data ?? []) as FileJob[])
  }

  async function queueJob(type: FileJobType, relativePath = currentPath, content?: string) {
    if (!user || !server) return null
    setBusy(true)

    const { data, error } = await supabase
      .from('jobs')
      .insert({
        node_id: server.node_id,
        user_id: user.id,
        type,
        status: 'pending',
        payload: {
          requested_at: new Date().toISOString(),
          server_id: server.id,
          installPath: server.install_path,
          relativePath,
          content,
        },
      })
      .select('id')
      .single()

    if (error) alert(error.message)
    await fetchJobs()
    setBusy(false)
    return data?.id ?? null
  }

  async function openFolder(path: string) {
    setCurrentPath(path)
    setSelectedPath('')
    setEditorContent('')
    setSaveState('idle')
    await queueJob('list_files', path)
  }

  async function openFile(path: string) {
    setSelectedPath(path)
    setSaveState('idle')
    lastAppliedReadJobId.current = null
    await queueJob('read_file', path)
  }

  async function saveFile() {
    if (!selectedPath) return
    setSaveState('saving')
    lastHandledWriteJobId.current = null
    await queueJob('write_file', selectedPath, editorContent)
  }

  async function createFolder() {
    const name = prompt('Folder name')
    if (!name) return
    const nextPath = currentPath ? `${currentPath}/${name}` : name
    await queueJob('create_folder', nextPath)
    await queueJob('list_files', currentPath)
  }

  async function deleteEntry(entry: FileEntry) {
    if (!confirm(`Delete ${entry.path}?`)) return
    await queueJob('delete_path', entry.path)
    if (selectedPath === entry.path) {
      setSelectedPath('')
      setEditorContent('')
      setSaveState('idle')
    }
    await queueJob('list_files', currentPath)
  }

  useEffect(() => {
    fetchServer()
    fetchJobs()
    if (!user) return

    const channel = supabase
      .channel(`server-files-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs', filter: `user_id=eq.${user.id}` }, fetchJobs)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, id])

  useEffect(() => {
    if (server && !latestListJob) queueJob('list_files', '')
  }, [server])

  useEffect(() => {
    if (!latestReadJob || latestReadJob.status !== 'completed') return
    if (latestReadJob.id === lastAppliedReadJobId.current) return
    if (saveState === 'saving') return

    lastAppliedReadJobId.current = latestReadJob.id
    setEditorContent(getFileContent(latestReadJob))
  }, [latestReadJob?.id, latestReadJob?.status, saveState])

  useEffect(() => {
    if (!latestWriteJob) return
    if (latestWriteJob.id === lastHandledWriteJobId.current) return

    if (latestWriteJob.status === 'completed') {
      lastHandledWriteJobId.current = latestWriteJob.id
      setSaveState('saved')
      queueJob('read_file', selectedPath)
      queueJob('list_files', currentPath)
      window.setTimeout(() => setSaveState('idle'), 1800)
    }

    if (latestWriteJob.status === 'failed') {
      lastHandledWriteJobId.current = latestWriteJob.id
      setSaveState('failed')
    }
  }, [latestWriteJob?.id, latestWriteJob?.status])

  if (loading) return <div className="p-8 text-slate-400">Loading files...</div>
  if (!server) return <div className="p-8 text-slate-400">Server not found.</div>

  const parentPath = currentPath.split('/').filter(Boolean).slice(0, -1).join('/')
  const saveLabel = saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved' : saveState === 'failed' ? 'Failed' : 'Save'

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <button onClick={() => navigate(`/servers/${server.id}`)} className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to server
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Files</h1>
          <p className="text-slate-400 text-sm mt-1">{server.name} / <span className="font-mono">{currentPath || '/'}</span></p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => queueJob('list_files', currentPath)} disabled={busy} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 disabled:opacity-40">
            <RefreshCw className={busy ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} /> Refresh
          </button>
          <button onClick={createFolder} disabled={busy} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-40">
            <FolderPlus className="w-4 h-4" /> New Folder
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <p className="text-sm text-slate-200 font-semibold">Browser</p>
            {currentPath && <button onClick={() => openFolder(parentPath)} className="text-xs text-brand-400 hover:text-brand-300">Up one level</button>}
          </div>
          <div className="divide-y divide-slate-800">
            {entries.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Loading or empty folder. Click Refresh if needed.</p>
            ) : entries.map(entry => (
              <div key={entry.path} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/50">
                {entry.type === 'directory' ? <Folder className="w-4 h-4 text-brand-400" /> : <FileText className="w-4 h-4 text-slate-400" />}
                <button onClick={() => entry.type === 'directory' ? openFolder(entry.path) : openFile(entry.path)} className="flex-1 text-left text-sm text-slate-200 hover:text-brand-300 truncate">
                  {entry.name}
                </button>
                <span className="text-xs text-slate-500 w-20 text-right">{entry.type === 'file' ? formatSize(entry.size) : 'folder'}</span>
                <button onClick={() => deleteEntry(entry)} className="p-1.5 rounded text-slate-500 hover:text-red-300 hover:bg-red-500/10">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-200 font-semibold">Editor</p>
              {saveState === 'saved' && <p className="text-xs text-emerald-400 mt-0.5">Saved and refreshed</p>}
              {saveState === 'failed' && <p className="text-xs text-red-400 mt-0.5">Save failed</p>}
            </div>
            <button onClick={saveFile} disabled={!selectedPath || busy || saveState === 'saving'} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-40">
              {saveState === 'saving' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saveLabel}
            </button>
          </div>
          <div className="px-4 py-2 border-b border-slate-800 text-xs text-slate-500 font-mono truncate">
            {selectedPath || 'Select an editable file'}
          </div>
          <textarea
            value={editorContent}
            onChange={event => {
              setEditorContent(event.target.value)
              if (saveState !== 'saving') setSaveState('idle')
            }}
            disabled={!selectedPath}
            className="w-full min-h-[34rem] bg-slate-950 text-slate-200 p-4 font-mono text-xs outline-none resize-none disabled:opacity-50"
            placeholder="Open a .xml, .json, .cfg, .ini or .txt file to edit it."
          />
        </div>
      </div>
    </div>
  )
}
