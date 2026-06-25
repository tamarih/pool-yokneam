import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ChevronLeft, ChevronRight, Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import toast from 'react-hot-toast'
import LoadingSpinner from '@/components/shared/LoadingSpinner'

interface Employee { id: string; name: string; active: boolean }
interface Shift {
  id: string; date: string; shift_type: 'morning' | 'evening'
  start_time: string; end_time: string; employee_id: string | null; notes: string | null
}

// Default [start, end] per weekday (0=Sun) per shift type
const DEFAULTS: Record<number, { morning?: [string, string]; evening?: [string, string] }> = {
  0: { evening: ['15:00', '20:00'] },                                    // א׳ — אין בוקר
  1: { morning: ['07:30', '09:30'], evening: ['16:00', '20:00'] },       // ב׳
  2: { morning: ['07:30', '09:30'], evening: ['16:00', '18:00'] },       // ג׳
  3: { morning: ['07:00', '13:30'], evening: ['13:30', '20:00'] },       // ד׳
  4: { morning: ['07:00', '14:00'], evening: ['14:00', '22:00'] },       // ה׳
  5: { morning: ['07:00', '13:00'], evening: ['13:00', '18:00'] },       // ו׳
  6: { morning: ['07:30', '14:00'], evening: ['16:00', '20:00'] },       // ש׳
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

export default function AdminShifts() {
  const [weekStart, setWeekStart] = useState(getWeekStart())
  const [employees, setEmployees] = useState<Employee[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [newEmpName, setNewEmpName] = useState('')
  const [addingEmp, setAddingEmp] = useState(false)
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null)
  const [editingEmpName, setEditingEmpName] = useState('')

  const weekEnd = addDays(weekStart, 6)

  useEffect(() => { loadAll() }, [])
  useEffect(() => { loadShifts() }, [weekStart])

  async function loadAll() {
    setLoading(true)
    const [emps, shiftData] = await Promise.all([
      supabase.from('employees').select('*').eq('active', true).order('name'),
      supabase.from('shifts').select('*').gte('date', weekStart).lte('date', weekEnd),
    ])
    setEmployees(emps.data ?? [])
    setShifts(shiftData.data ?? [])
    setLoading(false)
  }

  async function loadShifts() {
    const { data } = await supabase.from('shifts').select('*').gte('date', weekStart).lte('date', weekEnd)
    setShifts(data ?? [])
  }

  async function saveShift(date: string, type: 'morning' | 'evening', start: string, end: string, employeeId: string | null, notes: string) {
    const existing = shifts.find(s => s.date === date && s.shift_type === type)
    if (existing) {
      const { error } = await supabase.from('shifts').update({
        start_time: start, end_time: end, employee_id: employeeId || null,
        notes: notes || null, updated_at: new Date().toISOString(),
      }).eq('id', existing.id)
      if (error) { toast.error('שגיאה בשמירה'); return }
    } else {
      const { error } = await supabase.from('shifts').insert({
        date, shift_type: type, start_time: start, end_time: end,
        employee_id: employeeId || null, notes: notes || null,
      })
      if (error) { toast.error('שגיאה בשמירה'); return }
    }
    toast.success('נשמר')
    loadShifts()
  }

  async function addEmployee() {
    const name = newEmpName.trim()
    if (!name) return
    const { error } = await supabase.from('employees').insert({ name })
    if (error) { toast.error('שגיאה'); return }
    setNewEmpName(''); setAddingEmp(false)
    toast.success('עובד נוסף')
    const { data } = await supabase.from('employees').select('*').eq('active', true).order('name')
    setEmployees(data ?? [])
  }

  async function renameEmployee(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const { error } = await supabase.from('employees').update({ name: trimmed }).eq('id', id)
    if (error) { toast.error('שגיאה בעדכון'); return }
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, name: trimmed } : e))
    setEditingEmpId(null)
    toast.success('השם עודכן')
  }

  async function deactivateEmployee(id: string) {
    if (!confirm('להסיר עובד זה מהרשימה?')) return
    await supabase.from('employees').update({ active: false }).eq('id', id)
    const { data } = await supabase.from('employees').select('*').eq('active', true).order('name')
    setEmployees(data ?? [])
    toast.success('עובד הוסר')
  }

  if (loading) return <LoadingSpinner />

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i)
    const dow = new Date(date + 'T12:00:00').getDay()
    return { date, dow, label: DAY_HEB[dow] }
  })

  return (
    <div style={{ padding: '28px', direction: 'rtl' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827' }}>משמרות עובדים</h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>ניהול לוח משמרות שבועי</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setWeekStart(w => addDays(w, -7))} style={navBtn}>
            <ChevronRight size={18} />
          </button>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>
            {fmtDate(weekStart)} – {fmtDate(weekEnd)}
          </span>
          <button onClick={() => setWeekStart(w => addDays(w, 7))} style={navBtn}>
            <ChevronLeft size={18} />
          </button>
          <button onClick={() => setWeekStart(getWeekStart())} style={{
            padding: '8px 14px', background: '#f3f4f6', border: 'none', borderRadius: 8,
            fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151',
          }}>השבוע</button>
        </div>
      </div>

      {/* Weekly table */}
      <div style={{ background: 'white', borderRadius: 16, border: '1px solid #f3f4f6', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', marginBottom: 24 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                {['יום', 'תאריך', 'משמרת בוקר', 'משמרת ערב'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map(({ date, dow, label }) => {
                const isToday = date === new Date().toISOString().slice(0, 10)
                return (
                  <tr key={date} style={{ borderBottom: '1px solid #f9fafb', background: isToday ? '#eff6ff' : 'white' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: isToday ? '#1d4ed8' : '#374151', whiteSpace: 'nowrap' }}>
                      {label}{isToday && <span style={{ marginRight: 6, fontSize: 11, background: '#1d4ed8', color: 'white', borderRadius: 6, padding: '1px 6px' }}>היום</span>}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtDate(date)}</td>
                    <td style={{ padding: '8px 16px' }}>
                      {DEFAULTS[dow]?.morning ? (
                        <ShiftCell
                          date={date} type="morning"
                          defaults={DEFAULTS[dow].morning!}
                          existing={shifts.find(s => s.date === date && s.shift_type === 'morning') ?? null}
                          employees={employees}
                          onSave={saveShift}
                        />
                      ) : <span style={{ color: '#d1d5db', fontSize: 13 }}>—</span>}
                    </td>
                    <td style={{ padding: '8px 16px' }}>
                      {DEFAULTS[dow]?.evening ? (
                        <ShiftCell
                          date={date} type="evening"
                          defaults={DEFAULTS[dow].evening!}
                          existing={shifts.find(s => s.date === date && s.shift_type === 'evening') ?? null}
                          employees={employees}
                          onSave={saveShift}
                        />
                      ) : <span style={{ color: '#d1d5db', fontSize: 13 }}>—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Employees management */}
      <div style={{ background: 'white', borderRadius: 16, padding: '20px 24px', border: '1px solid #f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontWeight: 700, fontSize: 16 }}>רשימת עובדים</h3>
          <button onClick={() => setAddingEmp(v => !v)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8,
            padding: '6px 12px', fontSize: 13, color: '#1d4ed8', cursor: 'pointer', fontWeight: 600,
          }}>
            <Plus size={15} /> הוסף עובד
          </button>
        </div>
        {addingEmp && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              autoFocus
              value={newEmpName}
              onChange={e => setNewEmpName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addEmployee(); if (e.key === 'Escape') { setAddingEmp(false); setNewEmpName('') } }}
              placeholder="שם העובד"
              style={{ flex: 1, padding: '8px 12px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, outline: 'none' }}
            />
            <button onClick={addEmployee} style={{ padding: '8px 16px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>שמור</button>
            <button onClick={() => { setAddingEmp(false); setNewEmpName('') }} style={{ padding: '8px 12px', background: '#f3f4f6', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#6b7280', fontSize: 13 }}>ביטול</button>
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {employees.map(e => (
            <div key={e.id} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10,
              padding: '6px 10px', fontSize: 14, fontWeight: 500,
            }}>
              {editingEmpId === e.id ? (
                <>
                  <input
                    autoFocus
                    value={editingEmpName}
                    onChange={ev => setEditingEmpName(ev.target.value)}
                    onKeyDown={ev => {
                      if (ev.key === 'Enter') renameEmployee(e.id, editingEmpName)
                      if (ev.key === 'Escape') setEditingEmpId(null)
                    }}
                    style={{ width: 110, padding: '3px 7px', border: '1.5px solid #1d4ed8', borderRadius: 6, fontSize: 14, outline: 'none' }}
                  />
                  <button onClick={() => renameEmployee(e.id, editingEmpName)} title="שמור" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', display: 'flex', padding: 0 }}>
                    <Check size={15} />
                  </button>
                  <button onClick={() => setEditingEmpId(null)} title="ביטול" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', display: 'flex', padding: 0 }}>
                    <X size={15} />
                  </button>
                </>
              ) : (
                <>
                  {e.name}
                  <button onClick={() => { setEditingEmpId(e.id); setEditingEmpName(e.name) }} title="ערוך שם" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', padding: 0 }}>
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => deactivateEmployee(e.id)} title="הסר" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', padding: 0 }}>
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ShiftCell({ date, type, defaults, existing, employees, onSave }: {
  date: string; type: 'morning' | 'evening'
  defaults: [string, string]
  existing: Shift | null
  employees: Employee[]
  onSave: (date: string, type: 'morning' | 'evening', start: string, end: string, empId: string | null, notes: string) => Promise<void>
}) {
  const [start, setStart] = useState(existing?.start_time?.slice(0, 5) ?? defaults[0])
  const [end, setEnd] = useState(existing?.end_time?.slice(0, 5) ?? defaults[1])
  const [empId, setEmpId] = useState(existing?.employee_id ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  // sync when existing changes (e.g. after save or week change)
  const existingKey = (existing?.id ?? '') + (existing?.employee_id ?? '') + (existing?.start_time ?? '')
  useEffect(() => {
    setStart(existing?.start_time?.slice(0, 5) ?? defaults[0])
    setEnd(existing?.end_time?.slice(0, 5) ?? defaults[1])
    setEmpId(existing?.employee_id ?? '')
    setNotes(existing?.notes ?? '')
    setDirty(false)
  }, [existingKey])

  const hasEmployee = !!existing?.employee_id
  const bgColor = hasEmployee ? '#f0fdf4' : '#fff7ed'
  const borderColor = hasEmployee ? '#86efac' : '#fed7aa'

  async function handleSave() {
    setSaving(true)
    await onSave(date, type, start, end, empId || null, notes)
    setSaving(false)
    setDirty(false)
  }

  return (
    <div style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: 10, padding: '10px 12px', minWidth: 220 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
        <input type="time" value={start} onChange={e => { setStart(e.target.value); setDirty(true) }}
          style={timeInput} />
        <span style={{ color: '#9ca3af', fontSize: 12 }}>–</span>
        <input type="time" value={end} onChange={e => { setEnd(e.target.value); setDirty(true) }}
          style={timeInput} />
      </div>
      <select value={empId} onChange={e => { setEmpId(e.target.value); setDirty(true) }}
        style={{ width: '100%', padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, marginBottom: 6, background: 'white', outline: 'none' }}>
        <option value="">— בחר עובד —</option>
        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
      <input value={notes} onChange={e => { setNotes(e.target.value); setDirty(true) }}
        placeholder="הערות (אופציונלי)"
        style={{ width: '100%', padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, marginBottom: 8, outline: 'none', boxSizing: 'border-box' }} />
      {dirty && (
        <button onClick={handleSave} disabled={saving} style={{
          width: '100%', padding: '6px', background: '#1d4ed8', color: 'white',
          border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>{saving ? 'שומר...' : 'שמור'}</button>
      )}
    </div>
  )
}

const navBtn: React.CSSProperties = {
  background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '8px',
  cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#374151',
}

const timeInput: React.CSSProperties = {
  flex: 1, padding: '4px 6px', border: '1px solid #e5e7eb', borderRadius: 6,
  fontSize: 13, outline: 'none', textAlign: 'center',
}
