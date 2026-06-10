import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { DashboardStats } from '@/types'
import { Users, CreditCard, Ticket, DoorOpen, TrendingUp, Calendar, PersonStanding } from 'lucide-react'
import LoadingSpinner from '@/components/shared/LoadingSpinner'

function StatCard({ icon: Icon, label, value, color, bg }: {
  icon: React.ElementType; label: string; value: number | string; color: string; bg: string
}) {
  return (
    <div style={{
      background: 'white', borderRadius: 16, padding: '20px 24px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f3f4f6',
      display: 'flex', alignItems: 'center', gap: 16, animation: 'fadeIn 0.3s ease',
    }}>
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

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

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

  const cards = [
    { icon: Users, label: 'משפחות פעילות', value: stats?.active_families ?? 0, color: '#1d4ed8', bg: '#dbeafe' },
    { icon: CreditCard, label: 'מנויים פעילים', value: stats?.active_memberships ?? 0, color: '#0284c7', bg: '#e0f2fe' },
    { icon: Ticket, label: 'כרטיסיות פעילות', value: stats?.active_punch_cards ?? 0, color: '#7c3aed', bg: '#ede9fe' },
    { icon: DoorOpen, label: 'כניסות היום', value: stats?.entries_today ?? 0, color: '#16a34a', bg: '#dcfce7' },
    { icon: TrendingUp, label: 'כניסות השבוע', value: stats?.entries_week ?? 0, color: '#0369a1', bg: '#e0f2fe' },
    { icon: Calendar, label: 'כניסות החודש', value: stats?.entries_month ?? 0, color: '#9333ea', bg: '#f3e8ff' },
    { icon: PersonStanding, label: 'בבריכה עכשיו (≈2 שעות)', value: stats?.people_inside ?? 0, color: '#059669', bg: '#d1fae5' },
  ]

  return (
    <div style={{ padding: '28px 28px', direction: 'rtl' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#111827' }}>דשבורד</h1>
        <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>סטטיסטיקות בזמן אמת - מתעדכן כל דקה</p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 16,
      }}>
        {cards.map(c => <StatCard key={c.label} {...c} />)}
      </div>

      {/* People inside highlight */}
      {(stats?.people_inside ?? 0) > 0 && (
        <div style={{
          marginTop: 24, background: 'linear-gradient(135deg, #0ea5e9, #1d4ed8)',
          borderRadius: 16, padding: '20px 28px', color: 'white',
          display: 'flex', alignItems: 'center', gap: 16,
          boxShadow: '0 4px 20px rgba(14,165,233,0.3)',
        }}>
          <div style={{ fontSize: 48, fontWeight: 900 }}>{stats?.people_inside}</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>אנשים בבריכה כרגע</div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>על פי כניסות ב-2 השעות האחרונות</div>
          </div>
        </div>
      )}
    </div>
  )
}
