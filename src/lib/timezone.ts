const KEY = 'apexgsp.timeZone'

export const TIME_ZONES = [
  'Europe/London',
  'Europe/Helsinki',
  'Europe/Stockholm',
  'Europe/Oslo',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Amsterdam',
  'Europe/Madrid',
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Singapore',
  'Australia/Sydney',
]

export function getPanelTimeZone() {
  return localStorage.getItem(KEY) || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export function setPanelTimeZone(timeZone: string) {
  localStorage.setItem(KEY, timeZone)
}

export function formatTimeZoneLabel(timeZone: string) {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(now)
  const offset = parts.find(part => part.type === 'timeZoneName')?.value || ''
  return offset ? `${timeZone} (${offset.replace('GMT', 'UTC')})` : timeZone
}
