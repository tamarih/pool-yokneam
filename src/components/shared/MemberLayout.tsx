import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { LogOut } from 'lucide-react'

export default function MemberLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #eff6ff 0%, #e0f2fe 100%)', direction: 'rtl' }}>
      <header style={{
        padding: '16px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo2.png" alt="יקנעם" style={{ height: 44, width: 44, objectFit: 'contain', borderRadius: 10 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#1e3a8a' }}>בריכת יקנעם</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>שלום, {profile?.full_name}</div>
          </div>
        </div>
        <button onClick={handleSignOut} style={{
          background: 'rgba(14,165,233,0.1)', border: 'none', borderRadius: 8,
          color: '#0284c7', cursor: 'pointer', padding: '8px 14px',
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 500,
        }}>
          <LogOut size={15} />
          יציאה
        </button>
      </header>
      <main style={{ padding: '0 16px 40px' }}>
        <Outlet />
      </main>
    </div>
  )
}
