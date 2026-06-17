function buildHeaders() {
  const key = process.env.APEXGSP_SUPABASE_ANON_KEY?.trim()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (key) {
    headers.Authorization = `Bearer ${key}`
    headers.apikey = key
  }

  return headers
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : null

  if (!response.ok) {
    const message = typeof data?.error === 'string'
      ? data.error
      : typeof data?.message === 'string'
        ? data.message
        : `Request failed: ${response.status}`
    throw new Error(message)
  }

  return data as T
}
