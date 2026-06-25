import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import LoadingSpinner from '@/components/shared/LoadingSpinner'

interface Shift {
  id: string; date: string; shift_type: 'morning' | 'evening'
  start_time: string; end_time: string; notes: string | null
  employees: { name: string } | null
}

const DAY_HEB = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function getWeekStart(d = new Date()) {
  const copy = new Date(d)
  copy.setDate(copy.getDate() - copy.getDay())
  return copy.toISOString().slice(0, 10)
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getDate()}/${d.getMonth() + 1}`
}

function ShiftBadge({ shift }: { shift: Shift | undefined }) {
  if (!shift) return <span style={{ color: '#d1d5db', fontSize: 13 }}>—</span>
  const hasEmployee = !!shift.employees
  return (
    <div style={{
      background: hasEmployee ? '#f0fdf4' : '#fff7ed',
      border: `1px solid ${hasEmployee ? '#86efac' : '#fed7aa'}`,
      borderRadius: 8, padding: '8px 10px', fontSize: 13,
    }}>
      <div style={{ fontWeight: 600, color: '#374151', marginBottom: 2 }}>
        {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}
      </div>
      <div style={{ color: hasEmployee ? '#16a34a' : '#ea580c', fontWeight: 500 }}>
        {shift.employees?.name ?? 'לא משובץ'}
      </div>
      {shift.notes && <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 2 }}>{shift.notes}</div>}
    </div>
  )
}

export default function GuardWeeklyShifts() {
  const [weekStart, setWeekStart] = useState(getWeekStart())
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)

  const weekEnd = addDays(weekStart, 6)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('shifts')
        .select('*, employees(name)')
        .gte('date', weekStart)
        .lte('date', weekEnd)
        .order('date').order('start_time')
      setShifts((data ?? []) as Shift[])
      setLoading(false)
    }
    load()
  }, [weekStart])

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i)
    const dow = new Date(date + 'T12:00:00').getDay()
    return { date, dow }
  })

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div style={{ direction: 'rtl' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>משמרות השבוע</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setWeekStart(w => addDays(w, -7))} style={navBtn}><ChevronRight size={16} /></button>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{fmtDate(weekStart)} – {fmtDate(weekEnd)}</span>
          <button onClick={() => setWeekStart(w => addDays(w, 7))} style={navBtn}><ChevronLeft size={16} /></button>
          <button onClick={() => setWeekStart(getWeekStart())} style={{ ...navBtn, padding: '6px 10px', fontSize: 12 }}>השבוע</button>
        </div>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div style={{ background: 'white', borderRadius: 14, overflow: 'hidden', border: '1px solid #f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                {['יום', 'תאריך', 'בוקר', 'ערב'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: '#374151' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map(({ date, dow }) => {
                const isToday = date === today
                const morning = shifts.find(s => s.date === date && s.shift_type === 'morning')
                const evening = shifts.find(s => s.date === date && s.shift_type === 'evening')
                return (
                  <tr key={date} style={{ borderBottom: '1px solid #f9fafb', background: isToday ? '#eff6ff' : 'white' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: isToday ? '#1d4ed8' : '#374151', whiteSpace: 'nowrap' }}>
                      {DAY_HEB[dow]}{isToday && <span style={{ marginRight: 6, fontSize: 10, background: '#1d4ed8', color: 'white', borderRadius: 4, padding: '1px 5px' }}>היום</span>}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtDate(date)}</td>
                    <td style={{ padding: '8px 14px' }}><ShiftBadge shift={morning} /></td>
                    <td style={{ padding: '8px 14px' }}><ShiftBadge shift={evening} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const navBtn: React.CSSProperties = {
  background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '6px 8px',
  cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#374151',
}
