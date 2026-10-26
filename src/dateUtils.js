export function shiftIsoDate(value, days) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

export function formatUtc(value, style = 'datetime') {
  if (!value) return '—'

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00Z`
    : /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return 'Invalid timestamp'

  const options = {
    timeZone: 'UTC',
    hourCycle: 'h23',
    ...(style === 'time' && { hour: '2-digit', minute: '2-digit' }),
    ...(style === 'datetime' && { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
    ...(style === 'datetime-year' && { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    ...(style === 'date' && { day: '2-digit', month: 'short', year: 'numeric' }),
  }

  return new Intl.DateTimeFormat('en-GB', options).format(date)
}
