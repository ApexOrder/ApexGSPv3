export interface RegisterResult {
  success: boolean
  node_id: string
  node_secret: string
}

export interface QueueJob {
  id: string
  type: string
  payload: unknown
}

export interface NextJobResult {
  success: boolean
  job: QueueJob | null
}
