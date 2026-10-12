export function localCalendarDate(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

export function presetRange(name, now = new Date()) {
  if (name === 'today') return { dateFrom: localCalendarDate(now), dateTo: localCalendarDate(now) }
  if (name === 'week') {
    const start = new Date(now)
    start.setDate(now.getDate() - 6)
    return { dateFrom: localCalendarDate(start), dateTo: localCalendarDate(now) }
  }
  const start = new Date(now.getFullYear(), now.getMonth() - (name === 'previous' ? 1 : 0), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + (name === 'previous' ? 0 : 1), 0)
  return { dateFrom: localCalendarDate(start), dateTo: localCalendarDate(end) }
}
