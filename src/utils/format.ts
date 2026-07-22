import { format, parseISO, isValid, differenceInDays } from 'date-fns'
import { he } from 'date-fns/locale'

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    const d = parseISO(dateStr)
    if (!isValid(d)) return '—'
    return format(d, 'dd/MM/yyyy', { locale: he })
  } catch {
    return '—'
  }
}

const IL_LOCALE = 'he-IL'
const IL_TZ = 'Asia/Jerusalem'

export function formatTime(timeStr: string | null | undefined): string {
  if (!timeStr) return '—'
  // Postgres returns "HH:MM:SS" — just take first 5 chars for "HH:MM"
  if (/^\d{2}:\d{2}/.test(timeStr)) return timeStr.slice(0, 5)
  // ISO datetime string — extract time part
  try {
    const d = new Date(timeStr)
    if (isNaN(d.getTime())) return timeStr.slice(0, 5)
    const h = d.getHours().toString().padStart(2, '0')
    const m = d.getMinutes().toString().padStart(2, '0')
    return `${h}:${m}`
  } catch {
    return timeStr.slice(0, 5)
  }
}

export function formatDateTime(ts: string | null | undefined): string {
  if (!ts) return '—'
  try {
    const d = new Date(ts)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleString(IL_LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: IL_TZ })
  } catch {
    return '—'
  }
}

export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  try {
    const d = parseISO(dateStr)
    if (!isValid(d)) return null
    return differenceInDays(d, new Date())
  } catch {
    return null
  }
}

export function membershipTypeLabel(type: string): string {
  const map: Record<string, string> = {
    seasonal: 'מנוי עונתי',
    annual: 'מנוי שנתי',
    punch_card: 'כרטיסייה',
  }
  return map[type] ?? type
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    active: 'פעיל',
    inactive: 'לא פעיל',
    suspended: 'מושהה',
    depleted: 'נוצל',
    expired: 'פג תוקף',
    valid: 'תקין',
    cancelled: 'בוטל',
  }
  return map[status] ?? status
}

export function entryTypeLabel(type: string): string {
  const map: Record<string, string> = {
    membership: 'מנוי',
    punch_card: 'כרטיסייה',
    guest: 'אורח',
  }
  return map[type] ?? type
}

export function statusColor(status: string): { color: string; bg: string } {
  const map: Record<string, { color: string; bg: string }> = {
    active: { color: '#16a34a', bg: '#dcfce7' },
    valid: { color: '#16a34a', bg: '#dcfce7' },
    inactive: { color: '#6b7280', bg: '#f3f4f6' },
    suspended: { color: '#d97706', bg: '#fef3c7' },
    depleted: { color: '#9ca3af', bg: '#f3f4f6' },
    expired: { color: '#dc2626', bg: '#fee2e2' },
    cancelled: { color: '#dc2626', bg: '#fee2e2' },
  }
  return map[status] ?? { color: '#6b7280', bg: '#f3f4f6' }
}
