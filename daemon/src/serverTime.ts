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
  const configuredTimeZone = process.env.APEXGSP_TIME_ZONE?.trim() || process.env.TZ?.trim() || ''
  const resolvedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'System local time'
  const timeZone = configuredTimeZone || resolvedTimeZone

  return {
    message: 'Server time loaded',
    localIso: now.toISOString(),
    localDisplay: now.toLocaleString('en-GB', { timeZone }),
    utcDisplay: now.toUTCString(),
    timeZone,
    resolvedTimeZone,
    configuredTimeZone: configuredTimeZone || null,
    utcOffset: offsetLabel(now),
    schedulesUse: 'daemon_local_time',
  }
}
