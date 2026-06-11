import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  LayoutDashboard, Users, DoorOpen, BarChart3, LogOut, Menu, X, Waves, Upload
} from 'lucide-react'

const navItems = [
  { to: '/admin', label: 'דשבורד', icon: LayoutDashboard, end: true },
  { to: '/admin/families', label: 'משפחות', icon: Users },
  { to: '/admin/entries', label: 'כניסות', icon: DoorOpen },
  { to: '/admin/reports', label: 'דוחות', icon: BarChart3 },
  { to: '/admin/import', label: 'ייבוא', icon: Upload },
]

export default function AdminLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', direction: 'rtl' }}>
      {/* Sidebar */}
      <aside style={{
        width: open ? 240 : 64,
        transition: 'width 0.25s',
        background: 'linear-gradient(180deg, #1e3a8a 0%, #1d4ed8 100%)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0, right: 0, bottom: 0,
        zIndex: 50,
        overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <img src="/logo.png" alt="יקנעם" style={{ minWidth: 32, height: 32, width: 'auto', filter: 'brightness(0) invert(1)', objectFit: 'contain' }} />
          {open && <span style={{ color: 'white', fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap' }}>בריכת יקנעם</span>}
        </div>

        {/* Toggle */}
        <button onClick={() => setOpen(v => !v)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '12px 16px', color: 'rgba(255,255,255,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: open ? 'flex-end' : 'center',
        }}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 0' }}>
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px', textDecoration: 'none',
              color: isActive ? 'white' : 'rgba(255,255,255,0.65)',
              background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
              borderRight: isActive ? '3px solid #38bdf8' : '3px solid transparent',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            })}>
              <Icon size={20} style={{ minWidth: 20 }} />
              {open && <span style={{ fontSize: 14, fontWeight: 500 }}>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User + logout */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', padding: '12px 16px' }}>
          {open && <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile?.full_name}</p>}
          <button onClick={handleSignOut} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.65)', width: '100%', padding: '6px 0',
          }}>
            <LogOut size={18} style={{ minWidth: 18 }} />
            {open && <span style={{ fontSize: 14 }}>יציאה</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, marginRight: open ? 240 : 64, transition: 'margin-right 0.25s', minHeight: '100vh' }}>
        <Outlet />
      </main>
    </div>
  )
}
