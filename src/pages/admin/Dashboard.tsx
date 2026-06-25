import { useEffect, useState } from 'react'
import React from 'react'
import { supabase } from '@/lib/supabase'
import { DashboardStats } from '@/types'
import { Users, CreditCard, Ticket, DoorOpen, TrendingUp, Calendar, PersonStanding, X, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import { formatTime } from '@/utils/format'

type EntryRange = 'inside' | 'today' | 'week' | 'month'

interface ShiftWithEmployee {
  id: string; date: string; shift_type: 'morning' | 'evening'
  start_time: string; end_time: string; notes: string | null
  employee_id: string | null
  employees: { name: string } | null
}

function getILTime() {
  return new Date().toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false })
}

function useShifts() {
  const [current, setCurrent] = useState<ShiftWithEmployee | null | undefined>(undefined)
  const [next, setNext] = useState<ShiftWithEmployee | null>(null)
  const [missingCount, setMissingCount] = useState(0)

  useEffect(() => {
    async function load() {
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' })
      const weekEnd = new Date(new Date(today).getTime() + 7 * 86400000).toISOString().slice(0, 10)

      const { data } = await supabase
        .from('shifts')
        .select('*, employees(name)')
        .gte('date', today)
        .lte('date', weekEnd)
        .order('date').order('start_time')

      if (!data) return
      const nowTime = getILTime()
      const todayShifts = data.filter(s => s.date === today) as ShiftWithEmployee[]
      const cur = todayShifts.find(s => s.start_time.slice(0, 5) <= nowTime && nowTime < s.end_time.slice(0, 5)) ?? null
      const nxt = todayShifts.find(s => s.start_time.slice(0, 5) > nowTime) ?? null
      setCurrent(cur)
      setNext(nxt)
      setMissingCount(data.filter((s: any) => !s.employee_id).length)
    }
    load()
  }, [])

  return { current, next, missingCount }
}

interface EntryRow {
  id: string
  people_count: number
  entry_time: string
  entry_date: string
  created_at: string
  member_names: string[] | null
  family_name_snapshot: string | null
  family: { family_name: string; first_name: string | null; family_number: string | null } | null
}

type BackupTable = 'families' | 'family_members' | 'memberships' | 'punch_cards' | 'entries'

function entryFamilyName(entry: Pick<EntryRow, 'family' | 'family_name_snapshot'>): string {
  const liveName = [entry.family?.first_name, entry.family?.family_name].filter(Boolean).join(' ').trim()
  return liveName || entry.family_name_snapshot || 'משפחה שנמחקה'
}

function StatCard({ icon: Icon, label, value, color, bg, onClick }: {
  icon: React.ElementType; label: string; value: number | string; color: string; bg: string; onClick?: () => void
}) {
  return (
    <div onClick={onClick} style={{
      background: 'white', borderRadius: 16, padding: '20px 24px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f3f4f6',
      display: 'flex', alignItems: 'center', gap: 16, animation: 'fadeIn 0.3s ease',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'transform 0.15s, box-shadow 0.15s',
    }}
    onMouseEnter={e => { if (onClick) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,0,0,0.08)' } }}
    onMouseLeave={e => { if (onClick) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)' } }}
    >
      <div style={{ width: 52, height: 52, borderRadius: 14, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={24} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#111827', lineHeight: 1 }}>{value.toLocaleString()}</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{label}</div>
      </div>
    </div>
  )
}

function EntriesModal({ range, onClose }: { range: EntryRange; onClose: () => void }) {
  const [rows, setRows] = useState<EntryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const now = new Date()
      let query = supabase
        .from('entries')
        .select('id, people_count, entry_time, entry_date, created_at, member_names, family_name_snapshot, family:families(family_name, first_name, family_number)')
        .eq('status', 'valid')
        .order('created_at', { ascending: false })

      if (range === 'inside') {
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()
        query = query.gte('created_at', twoHoursAgo)
      } else if (range === 'today') {
        query = query.eq('entry_date', now.toISOString().slice(0, 10))
      } else if (range === 'week') {
        const ws = new Date(now); ws.setDate(ws.getDate() - ws.getDay())
        query = query.gte('entry_date', ws.toISOString().slice(0, 10))
      } else if (range === 'month') {
        const ms = new Date(now.getFullYear(), now.getMonth(), 1)
        query = query.gte('entry_date', ms.toISOString().slice(0, 10))
      }

      const { data } = await query
      setRows((data ?? []) as any)
      setLoading(false)
    }
    load()
  }, [range])

  const titles: Record<EntryRange, string> = {
    inside: 'בבריכה עכשיו (≈2 שעות אחרונות)',
    today: 'כניסות היום',
    week: 'כניסות השבוע',
    month: 'כניסות החודש',
  }

  const totalPeople = rows.reduce((s, r) => s + r.people_count, 0)

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      padding: 20, direction: 'rtl',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'white', borderRadius: 16, width: '100%', maxWidth: 720,
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
      }}>
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid #f3f4f6',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#111827', margin: 0 }}>{titles[range]}</h2>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0 0' }}>
              {rows.length} רשומות · {totalPeople} אנשים
            </p>
          </div>
          <button onClick={onClose} style={{
            background: '#f3f4f6', border: 'none', borderRadius: 10,
            width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={18} color="#6b7280" />
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center' }}><LoadingSpinner /></div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>אין כניסות בטווח זה</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f9fafb' }}>
                <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                  {['תאריך', 'שעה', 'משפחה', 'מס׳', 'אנשים'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: '#374151', fontSize: 13 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const label = entryFamilyName(r)
                  const isExpanded = expandedRow === r.id
                  const hasNames = (r.member_names?.length ?? 0) > 0
                  return (
                    <React.Fragment key={r.id}>
                      <tr
                        onClick={() => hasNames && setExpandedRow(isExpanded ? null : r.id)}
                        style={{
                          borderBottom: isExpanded ? 'none' : '1px solid #f9fafb',
                          cursor: hasNames ? 'pointer' : 'default',
                          background: isExpanded ? '#f9fafb' : 'transparent',
                        }}>
                        <td style={{ padding: '10px 16px', color: '#6b7280', fontSize: 13 }}>{r.entry_date}</td>
                        <td style={{ padding: '10px 16px', color: '#374151' }}>{formatTime(r.entry_time)}</td>
                        <td style={{ padding: '10px 16px', fontWeight: 600 }}>
                          {hasNames && <span style={{ color: '#9ca3af', marginLeft: 6 }}>{isExpanded ? '▼' : '◀'}</span>}
                          {label}
                        </td>
                        <td style={{ padding: '10px 16px', color: '#9ca3af', fontSize: 13 }}>{r.family?.family_number ?? '—'}</td>
                        <td style={{ padding: '10px 16px', fontWeight: 700, color: '#1d4ed8' }}>{r.people_count}</td>
                      </tr>
                      {isExpanded && hasNames && (
                        <tr style={{ borderBottom: '1px solid #f9fafb', background: '#f9fafb' }}>
                          <td colSpan={5} style={{ padding: '4px 16px 14px 16px' }}>
                            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>נכנסו:</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {r.member_names!.map((n, i) => (
                                <span key={i} style={{
                                  background: '#dbeafe', color: '#1e40af',
                                  borderRadius: 8, padding: '4px 10px',
                                  fontSize: 13, fontWeight: 600,
                                }}>{n}</span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}


async function fetchAllRows(table: BackupTable): Promise<any[]> {
  const pageSize = 1000
  const rows: any[] = []

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + pageSize - 1)

    if (error) throw error

    const page = data ?? []
    rows.push(...page)
    if (page.length < pageSize) break
  }

  return rows
}

// Parse a CSV (with possible BOM) into array of objects keyed by header row
function parseCSV(text: string): Record<string, string>[] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQuotes = false
      else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { cur.push(field); field = '' }
      else if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = '' }
      else if (c === '\r') { /* skip */ }
      else field += c
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur) }
  if (rows.length === 0) return []
  const headers = rows[0]
  return rows.slice(1).filter(r => r.some(c => c.length > 0)).map(r => {
    const obj: Record<string, string> = {}
    headers.forEach((h, idx) => { obj[h] = r[idx] ?? '' })
    return obj
  })
}

// Normalize a CSV row for insert: empty string → null, numbers stay strings
// (Postgres/Supabase will cast). Drop computed/server-managed cols.
function cleanRow(r: Record<string, string>, drop: string[] = []): any {
  const out: any = {}
  for (const [k, v] of Object.entries(r)) {
    if (drop.includes(k)) continue
    if (v === '' || v === 'NULL' || v === 'null') out[k] = null
    else if (v.startsWith('{') || v.startsWith('[')) {
      try { out[k] = JSON.parse(v) } catch { out[k] = v }
    }
    else out[k] = v
  }
  return out
}

export default function AdminDashboard() {
  const { current: currentShift, next: nextShift, missingCount } = useShifts()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalRange, setModalRange] = useState<EntryRange | null>(null)
  const [exporting, setExporting] = useState(false)

  async function restoreFromCSV(file: File, table: BackupTable) {
    const text = await file.text()
    const rows = parseCSV(text)
    if (rows.length === 0) { toast.error('הקובץ ריק'); return }
    // remove generated/server-managed cols per table
    const drop: Record<string, string[]> = {
      families: ['updated_at'],
      family_members: [],
      memberships: [],
      punch_cards: ['remaining_entries', 'updated_at'],
      entries: [],
    }
    const cleaned = rows.map(r => cleanRow(r, drop[table]))
    let ok = 0, errors = 0
    const errorMsgs: string[] = []
    // upsert in chunks of 100
    for (let i = 0; i < cleaned.length; i += 100) {
      const chunk = cleaned.slice(i, i + 100)
      const { error, count } = await supabase.from(table).upsert(chunk, { onConflict: 'id', count: 'exact' })
      if (error) {
        errors += chunk.length
        if (errorMsgs.length < 3) errorMsgs.push(error.message)
      } else {
        ok += count ?? chunk.length
      }
    }
    if (errors > 0) {
      toast.error(`${table}: ${ok} שוחזרו, ${errors} שגיאות. ${errorMsgs[0] ?? ''}`)
    } else {
      toast.success(`${table}: ${ok} רשומות שוחזרו`)
    }
  }

  async function exportAll() {
    setExporting(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const [families, members, memberships, punchCards, entries] = await Promise.all([
        fetchAllRows('families'),
        fetchAllRows('family_members'),
        fetchAllRows('memberships'),
        fetchAllRows('punch_cards'),
        fetchAllRows('entries'),
      ])
      // Single .xlsx with one sheet per table — Excel reads Hebrew correctly without encoding tricks
      const xlsx = await import('xlsx')
      const wb = xlsx.utils.book_new()
      const addSheet = (name: string, rows: any[]) => {
        const ws = xlsx.utils.json_to_sheet(rows.length > 0 ? rows : [{}])
        xlsx.utils.book_append_sheet(wb, ws, name)
      }
      addSheet('families', families)
      addSheet('family_members', members)
      addSheet('memberships', memberships)
      addSheet('punch_cards', punchCards)
      addSheet('entries', entries)
      xlsx.writeFile(wb, `pool_backup_${today}.xlsx`)
      toast.success('ייצוא הסתיים — בדקי בתיקיית ההורדות')
    } catch (e: any) {
      toast.error('שגיאה בייצוא: ' + (e?.message ?? 'לא ידוע'))
    }
    setExporting(false)
  }

  useEffect(() => {
    async function load() {
      const { data } = await supabase.rpc('get_dashboard_stats')
      setStats(data)
      setLoading(false)
    }
    load()
    const interval = setInterval(load, 60_000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return <LoadingSpinner />

  const cards: Array<{ icon: React.ElementType; label: string; value: number; color: string; bg: string; range?: EntryRange }> = [
    { icon: Users, label: 'משפחות פעילות', value: stats?.active_families ?? 0, color: '#1d4ed8', bg: '#dbeafe' },
    { icon: CreditCard, label: 'מנויים פעילים', value: stats?.active_memberships ?? 0, color: '#0284c7', bg: '#e0f2fe' },
    { icon: Ticket, label: 'כרטיסיות פעילות', value: stats?.active_punch_cards ?? 0, color: '#7c3aed', bg: '#ede9fe' },
    { icon: DoorOpen, label: 'כניסות היום', value: stats?.entries_today ?? 0, color: '#16a34a', bg: '#dcfce7', range: 'today' },
    { icon: TrendingUp, label: 'כניסות השבוע', value: stats?.entries_week ?? 0, color: '#0369a1', bg: '#e0f2fe', range: 'week' },
    { icon: Calendar, label: 'כניסות החודש', value: stats?.entries_month ?? 0, color: '#9333ea', bg: '#f3e8ff', range: 'month' },
    { icon: PersonStanding, label: 'בבריכה עכשיו (≈2 שעות)', value: stats?.people_inside ?? 0, color: '#059669', bg: '#d1fae5', range: 'inside' },
  ]

  return (
    <div style={{ padding: '28px 28px', direction: 'rtl' }}>
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#111827' }}>דשבורד</h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>סטטיסטיקות בזמן אמת - מתעדכן כל דקה</p>
        </div>
        <button
          onClick={exportAll}
          disabled={exporting}
          title="הורדת CSV של כל הנתונים — מומלץ לפני פעולות גדולות"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: exporting ? '#e5e7eb' : '#f3f4f6',
            color: '#374151', border: '1px solid #e5e7eb',
            borderRadius: 10, padding: '10px 16px',
            fontSize: 14, fontWeight: 600, cursor: exporting ? 'not-allowed' : 'pointer',
          }}>
          <Download size={16} />
          {exporting ? 'מייצא...' : 'גיבוי CSV של כל הנתונים'}
        </button>
      </div>

      {/* Shift alert */}
      {missingCount > 0 && (
        <div style={{ marginBottom: 20, background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 12, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🔴</span>
          <span style={{ fontWeight: 600, color: '#dc2626', fontSize: 14 }}>חסרות {missingCount} משמרות ללא עובד משובץ בשבוע הקרוב</span>
          <a href="/admin/shifts" style={{ marginRight: 'auto', fontSize: 13, color: '#dc2626', textDecoration: 'underline' }}>לניהול משמרות</a>
        </div>
      )}

      {/* Current shift card */}
      {currentShift !== undefined && (
        <div style={{ marginBottom: 20, background: 'white', borderRadius: 14, border: '1.5px solid #e5e7eb', padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, marginBottom: 4 }}>המשמרת הנוכחית</div>
            {currentShift ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>{currentShift.employees?.name ?? '—'}</span>
                <span style={{ fontSize: 13, color: '#6b7280' }}>{currentShift.start_time.slice(0, 5)}–{currentShift.end_time.slice(0, 5)}</span>
                {!currentShift.employee_id && <span style={{ color: '#dc2626', fontWeight: 600, fontSize: 13 }}>לא משובץ עובד</span>}
              </div>
            ) : (
              <span style={{ color: '#dc2626', fontWeight: 600, fontSize: 14 }}>לא משובץ עובד למשמרת הנוכחית</span>
            )}
          </div>
          {nextShift && (
            <div style={{ borderRight: '1px solid #f3f4f6', paddingRight: 16 }}>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, marginBottom: 4 }}>המשמרת הבאה</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#374151' }}>{nextShift.employees?.name ?? <span style={{ color: '#dc2626' }}>לא משובץ</span>}</span>
                <span style={{ fontSize: 13, color: '#6b7280' }}>{nextShift.start_time.slice(0, 5)}–{nextShift.end_time.slice(0, 5)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 16,
      }}>
        {cards.map(c => (
          <StatCard
            key={c.label}
            icon={c.icon}
            label={c.label}
            value={c.value}
            color={c.color}
            bg={c.bg}
            onClick={c.range ? () => setModalRange(c.range!) : undefined}
          />
        ))}
      </div>

      {(stats?.people_inside ?? 0) > 0 && (
        <div onClick={() => setModalRange('inside')} style={{
          marginTop: 24, background: 'linear-gradient(135deg, #0ea5e9, #1d4ed8)',
          borderRadius: 16, padding: '20px 28px', color: 'white',
          display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(14,165,233,0.3)',
        }}>
          <div style={{ fontSize: 48, fontWeight: 900 }}>{stats?.people_inside}</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>אנשים בבריכה כרגע</div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>על פי כניסות ב-2 השעות האחרונות · לחצי לרשימה</div>
          </div>
        </div>
      )}

      <HourlyChart />

      {/* Restore from CSV */}
      <RestoreSection onRestore={restoreFromCSV} />

      {modalRange && <EntriesModal range={modalRange} onClose={() => setModalRange(null)} />}
    </div>
  )
}

function HourlyChart() {
  const [hours, setHours] = useState<number[]>(Array(24).fill(0))
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('entries')
        .select('entry_time, people_count')
        .eq('entry_date', date)
        .eq('status', 'valid')
      if (!data) return
      const buckets = Array(24).fill(0)
      data.forEach(r => {
        if (!r.entry_time) return
        const d = new Date(`${date}T${r.entry_time}Z`)
        const ilHour = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' })).getHours()
        buckets[ilHour] += r.people_count
      })
      setHours(buckets)
    }
    load()
  }, [date])

  const max = Math.max(...hours, 1)
  const poolHours = Array.from({ length: 15 }, (_, i) => i + 7) // 7:00–21:00

  return (
    <div style={{ background: 'white', borderRadius: 16, padding: '20px 24px', border: '1px solid #f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h3 style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>כניסות לפי שעה</h3>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ padding: '6px 10px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
        {poolHours.map(h => {
          const val = hours[h]
          const pct = val / max
          return (
            <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
              {val > 0 && <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8' }}>{val}</div>}
              <div style={{
                width: '100%', borderRadius: '4px 4px 0 0',
                height: `${Math.max(pct * 90, val > 0 ? 8 : 0)}px`,
                background: val > 0 ? 'linear-gradient(180deg, #0ea5e9, #1d4ed8)' : '#f3f4f6',
                transition: 'height 0.3s',
              }} title={`${h}:00 — ${val} אנשים`} />
              <div style={{ fontSize: 10, color: '#9ca3af', whiteSpace: 'nowrap' }}>{h}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RestoreSection({ onRestore }: {
  onRestore: (file: File, table: BackupTable) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const tables: { key: BackupTable; label: string }[] = [
    { key: 'families', label: 'משפחות' },
    { key: 'family_members', label: 'חברי משפחה' },
    { key: 'memberships', label: 'מנויים' },
    { key: 'punch_cards', label: 'כרטיסיות' },
    { key: 'entries', label: 'כניסות' },
  ]
  return (
    <div style={{
      marginTop: 24, background: 'white', border: '1px solid #f3f4f6',
      borderRadius: 16, padding: '20px 24px',
    }}>
      <button onClick={() => setOpen(!open)} style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280',
        fontSize: 14, fontWeight: 600,
      }}>
        {open ? '▼' : '◀'} שחזור מקובץ CSV (מתקדם)
      </button>
      {open && (
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16, lineHeight: 1.6 }}>
            ⚠️ העלי קבצי CSV (אלה שהתקבלו מ"גיבוי CSV"). השחזור עושה upsert — אם רשומה כבר קיימת לפי id היא תעודכן, אחרת תיווצר.<br/>
            סדר מומלץ: משפחות → חברי משפחה → מנויים → כרטיסיות → כניסות.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {tables.map(t => (
              <label key={t.key} style={{
                background: '#f9fafb', border: '1.5px dashed #d1d5db',
                borderRadius: 10, padding: '14px 16px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>📥 {t.label}</span>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>בחרי קובץ {t.key}_*.csv</span>
                <input
                  type="file"
                  accept=".csv"
                  style={{ display: 'none' }}
                  onChange={async e => {
                    const f = e.target.files?.[0]
                    if (f) await onRestore(f, t.key)
                    e.target.value = ''
                  }}
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
