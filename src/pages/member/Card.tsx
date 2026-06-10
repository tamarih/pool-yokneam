import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Family, Membership, PunchCard } from '@/types'
import { QRCodeSVG } from 'qrcode.react'
import { membershipTypeLabel, formatDate, daysUntil } from '@/utils/format'
import { Waves, RefreshCw } from 'lucide-react'
import LoadingSpinner from '@/components/shared/LoadingSpinner'

export default function MemberCard() {
  const { user } = useAuth()
  const [family, setFamily] = useState<Family | null>(null)
  const [membership, setMembership] = useState<Membership | null>(null)
  const [punchCard, setPunchCard] = useState<PunchCard | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (user) load() }, [user])

  async function load() {
    setLoading(true)
    // find family linked to this user
    const { data: link } = await supabase
      .from('family_user_links')
      .select('family_id')
      .eq('user_id', user!.id)
      .single()

    if (!link) { setLoading(false); return }

    const today = new Date().toISOString().slice(0, 10)
    const [fam, mem, punch] = await Promise.all([
      supabase.from('families').select('*').eq('id', link.family_id).single(),
      supabase.from('memberships').select('*').eq('family_id', link.family_id).eq('active', true).gte('end_date', today).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('punch_cards').select('*').eq('family_id', link.family_id).eq('status', 'active').gt('remaining_entries', 0).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])

    setFamily(fam.data)
    setMembership(mem.data)
    setPunchCard(punch.data)
    setLoading(false)
  }

  if (loading) return <LoadingSpinner />

  if (!family) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🏊</div>
        <h2 style={{ fontWeight: 700, color: '#374151', marginBottom: 8 }}>לא נמצא כרטיס משפחה</h2>
        <p style={{ color: '#6b7280', fontSize: 14 }}>פנה למנהל המערכת לקישור החשבון שלך</p>
      </div>
    )
  }

  const days = daysUntil(family.end_date)
  const isActive = family.status === 'active' && (membership !== null || punchCard !== null)
  const isExpiringSoon = days !== null && days >= 0 && days <= 7

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', direction: 'rtl' }}>
      {/* Main card */}
      <div style={{
        background: 'white',
        borderRadius: 24,
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
        marginBottom: 16,
      }}>
        {/* Card header */}
        <div style={{
          background: 'linear-gradient(135deg, #1e3a8a 0%, #0284c7 100%)',
          padding: '24px',
          textAlign: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 }}>
            <Waves size={20} color="rgba(255,255,255,0.8)" />
            <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>בריכת יקנעם</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: 'white', marginBottom: 4 }}>
            משפחת {family.family_name}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>מס׳ {family.family_number}</p>
        </div>

        {/* QR Code */}
        <div style={{ padding: '28px 24px', textAlign: 'center', background: '#fafafa' }}>
          <div style={{
            background: 'white', borderRadius: 20, padding: 20,
            display: 'inline-block', boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
            marginBottom: 12,
          }}>
            <QRCodeSVG
              value={family.qr_token}
              size={220}
              level="H"
              fgColor="#1e3a8a"
              includeMargin={false}
            />
          </div>
          <p style={{ color: '#9ca3af', fontSize: 12 }}>הצג קוד זה מול השומר בכניסה לבריכה</p>
        </div>

        {/* Details */}
        <div style={{ padding: '0 20px 20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <DetailRow label="סוג מנוי" value={membershipTypeLabel(family.membership_type)} />
            {family.end_date && (
              <DetailRow
                label="תוקף המנוי"
                value={formatDate(family.end_date)}
                valueColor={isExpiringSoon ? '#d97706' : undefined}
              />
            )}
            {punchCard && (
              <DetailRow
                label="יתרת כניסות"
                value={`${punchCard.remaining_entries} כניסות`}
                valueColor={punchCard.remaining_entries <= 3 ? '#d97706' : '#16a34a'}
              />
            )}
          </div>
        </div>
      </div>

      {/* Status badge */}
      <div style={{
        borderRadius: 16, padding: '16px 20px', textAlign: 'center',
        background: isActive ? 'linear-gradient(135deg, #dcfce7, #bbf7d0)' : 'linear-gradient(135deg, #fee2e2, #fecaca)',
        border: `1.5px solid ${isActive ? '#86efac' : '#fca5a5'}`,
      }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: isActive ? '#16a34a' : '#dc2626' }}>
          {isActive ? '✅ מנוי פעיל' : '❌ מנוי לא פעיל'}
        </div>
        {isActive && isExpiringSoon && days !== null && (
          <div style={{ fontSize: 14, color: '#d97706', marginTop: 6, fontWeight: 600 }}>
            ⚠️ {days === 0 ? 'תוקף המנוי פג היום' : `המנוי יפוג בעוד ${days} ימים`}
          </div>
        )}
        {!isActive && (
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>
            פנה למשרד הבריכה לחידוש המנוי
          </div>
        )}
      </div>

      {/* Refresh */}
      <button onClick={load} style={{
        width: '100%', marginTop: 12, padding: '12px', background: 'rgba(255,255,255,0.8)',
        border: '1px solid #e5e7eb', borderRadius: 12, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        fontSize: 13, fontWeight: 500, color: '#6b7280',
      }}>
        <RefreshCw size={14} />
        רענן
      </button>
    </div>
  )
}

function DetailRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      background: '#f9fafb', borderRadius: 10, padding: '10px 14px', fontSize: 14,
    }}>
      <span style={{ color: '#6b7280' }}>{label}</span>
      <span style={{ fontWeight: 700, color: valueColor ?? '#111827' }}>{value}</span>
    </div>
  )
}
