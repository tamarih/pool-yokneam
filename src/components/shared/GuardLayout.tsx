import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { QrCode, List, LogOut, CalendarClock } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const IL_TZ = 'Asia/Jerusalem'

function nowIL() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: IL_TZ }))
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

interface Shift {
  date: string; shift_type: 'morning' | 'evening'
  start_time: string; end_time: string
  employees: { name: string } | null
}

function ShiftBanner() {
  const [current, setCurrent] = useState<Shift | null | undefined>(undefined)
  const [next, setNext] = useState<Shift | null>(null)

  useEffect(() => {
    async function load() {
      const todayIL = nowIL()
      const today = todayIL.toISOString().slice(0, 10)
      const tomorrow = new Date(todayIL)
      tomorrow.setDate(tomorrow.getDate() + 1)
      const tomorrowStr = tomorrow.toISOString().slice(0, 10)

      const { data } = await supabase
        .from('shifts')
        .select('date, shift_type, start_time, end_time, employees(name)')
        .in('date', [today, tomorrowStr])
        .order('date').order('start_time')

      if (!data) { setCurrent(null); return }

      const nowMin = nowIL().getHours() * 60 + nowIL().getMinutes()
      // Supabase returns employees as array; normalize to single object
      const shifts = (data as unknown[]).map((s: any) => ({
        ...s,
        employees: Array.isArray(s.employees) ? (s.employees[0] ?? null) : s.employees,
      })) as Shift[]

      const todayShifts = shifts.filter(s => s.date === today)
      const cur = todayShifts.find(s =>
        nowMin >= timeToMinutes(s.start_time) && nowMin < timeToMinutes(s.end_time)
      ) ?? null
      setCurrent(cur)

      // next = first future shift today, or first shift tomorrow
      const nxt = todayShifts.find(s => timeToMinutes(s.start_time) > nowMin)
        ?? shifts.find(s => s.date === tomorrowStr)
        ?? null
      setNext(nxt)
    }
    load()
  }, [])

  if (current === undefined) return null

  const SHIFT_LABEL: Record<string, string> = { morning: 'בוקר', evening: 'ערב' }

  return (
    <div style={{
      background: 'rgba(0,0,0,0.25)',
      padding: '8px 20px',
      display: 'flex', alignItems: 'center', gap: 16,
      fontSize: 13, color: 'rgba(255,255,255,0.95)',
      flexWrap: 'wrap',
    }}>
      {current ? (
        <span>
          <span style={{ opacity: 0.7 }}>משמרת עכשיו: </span>
          <strong>{current.employees?.name ?? 'לא משובץ'}</strong>
          <span style={{ opacity: 0.7 }}> ({SHIFT_LABEL[current.shift_type]} {current.start_time.slice(0,5)}–{current.end_time.slice(0,5)})</span>
        </span>
      ) : (
        <span style={{ opacity: 0.7 }}>אין משמרת פעילה כרגע</span>
      )}
      {next && (
        <span style={{ opacity: 0.85 }}>
          · <span style={{ opacity: 0.7 }}>הבא/ה: </span>
          <strong>{next.employees?.name ?? 'לא משובץ'}</strong>
          <span style={{ opacity: 0.7 }}> ({next.start_time.slice(0,5)})</span>
        </span>
      )}
    </div>
  )
}

export default function GuardLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', direction: 'rtl', background: '#f0f9ff' }}>
      {/* Top bar */}
      <header style={{
        background: 'linear-gradient(90deg, #1e3a8a, #0284c7)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}>
        <div style={{
          padding: '0 20px', height: 64,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link to="/guard" style={{ display: 'flex' }}><img src="/logo2.png" alt="יקנעם" style={{ height: 48, width: 48, objectFit: 'contain', borderRadius: 10 }} /></Link>
            <div>
              <div style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>בריכת יקנעם</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>שומר: {profile?.full_name}</div>
            </div>
          </div>
          <button onClick={handleSignOut} style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8,
            color: 'white', cursor: 'pointer', padding: '8px 14px',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 14,
          }}>
            <LogOut size={16} />
            יציאה
          </button>
        </div>
        <ShiftBanner />
      </header>

      {/* Nav tabs */}
      <nav style={{ background: 'white', borderBottom: '1px solid #e5e7eb', display: 'flex' }}>
        {[
          { to: '/guard', label: 'סריקת QR', icon: QrCode, end: true },
          { to: '/guard/entries', label: 'כניסות היום', icon: List },
          { to: '/guard/shifts', label: 'משמרות', icon: CalendarClock },
        ].map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '14px 20px', textDecoration: 'none',
            color: isActive ? '#0284c7' : '#6b7280',
            borderBottom: isActive ? '3px solid #0284c7' : '3px solid transparent',
            fontWeight: isActive ? 600 : 400,
            fontSize: 15,
            transition: 'all 0.15s',
          })}>
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Content */}
      <main style={{ flex: 1, padding: '24px 20px', maxWidth: 700, margin: '0 auto', width: '100%' }}>
        <Outlet />
      </main>
    </div>
  )
}
