function offsetLabel(date: Date) {
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absolute = Math.abs(offsetMinutes)
  const hours = Math.floor(absolute / 60).toString().padStart(2, '0')
  const minutes = (absolute % 60).toString().padStart(2, '0')
  return `UTC${sign}${hours}:${minutes}`
}

export async function getServerTime() {
  const now = new Date()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || process.env.TZ || 'System local time'

  return {
    message: 'Server time loaded',
    localIso: now.toISOString(),
    localDisplay: now.toLocaleString(),
    utcDisplay: now.toUTCString(),
    timeZone,
    utcOffset: offsetLabel(now),
    schedulesUse: 'daemon_local_time',
  }
}
