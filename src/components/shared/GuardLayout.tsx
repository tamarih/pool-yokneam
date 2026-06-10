import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { QrCode, List, LogOut, Waves } from 'lucide-react'

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
        padding: '0 20px',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ background: '#0ea5e9', borderRadius: 8, padding: 6 }}>
            <Waves size={20} color="white" />
          </div>
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
      </header>

      {/* Nav tabs */}
      <nav style={{ background: 'white', borderBottom: '1px solid #e5e7eb', display: 'flex' }}>
        {[
          { to: '/guard', label: 'סריקת QR', icon: QrCode, end: true },
          { to: '/guard/entries', label: 'כניסות היום', icon: List },
        ].map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '14px 24px', textDecoration: 'none',
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
