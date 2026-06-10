import { useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Family } from '@/types'
import { membershipTypeLabel, formatDate, daysUntil } from '@/utils/format'
import { X, Printer } from 'lucide-react'

interface Props {
  family: Family
  onClose: () => void
}

export default function FamilyQRCard({ family, onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)

  const days = daysUntil(family.end_date)
  const isExpiringSoon = days !== null && days >= 0 && days <= 7

  function handlePrint() {
    window.print()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200, padding: 20, direction: 'rtl',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'white', borderRadius: 24, maxWidth: 400, width: '100%', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}>
        {/* Toolbar */}
        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f3f4f6' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>כרטיס משפחה</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handlePrint} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, cursor: 'pointer', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 500, color: '#374151' }}>
              <Printer size={14} /> הדפסה
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Card content */}
        <div ref={cardRef} style={{
          padding: '28px 24px',
          background: 'linear-gradient(160deg, #eff6ff 0%, #e0f2fe 100%)',
          textAlign: 'center',
        }}>
          {/* Header */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#1e3a8a', marginBottom: 4 }}>
              משפחת {family.family_name}
            </div>
            <div style={{ fontSize: 14, color: '#6b7280' }}>מס׳ {family.family_number}</div>
          </div>

          {/* QR */}
          <div style={{
            background: 'white', borderRadius: 20, padding: 20,
            display: 'inline-block', boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            marginBottom: 20,
          }}>
            <QRCodeSVG
              value={family.qr_token}
              size={200}
              level="H"
              includeMargin={false}
              fgColor="#1e3a8a"
            />
          </div>

          {/* Details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <InfoRow label="סוג מנוי" value={membershipTypeLabel(family.membership_type)} />
            {family.end_date && (
              <InfoRow
                label="תוקף"
                value={formatDate(family.end_date)}
                warn={isExpiringSoon}
              />
            )}
            <StatusBadge status={family.status} days={days} />
          </div>

          <div style={{ marginTop: 16, fontSize: 11, color: '#9ca3af' }}>
            הצג כרטיס זה מול השומר בכניסה
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', background: 'white', borderRadius: 10, padding: '8px 16px', fontSize: 14 }}>
      <span style={{ color: '#6b7280' }}>{label}</span>
      <span style={{ fontWeight: 600, color: warn ? '#d97706' : '#111827' }}>{value}</span>
    </div>
  )
}

function StatusBadge({ status, days }: { status: string; days: number | null }) {
  const isActive = status === 'active'
  return (
    <div style={{
      background: isActive ? '#dcfce7' : '#fee2e2',
      borderRadius: 10, padding: '10px 16px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: isActive ? '#16a34a' : '#dc2626' }}>
        {isActive ? '✅ מנוי פעיל' : '❌ מנוי לא פעיל'}
      </div>
      {isActive && days !== null && days <= 30 && (
        <div style={{ fontSize: 12, color: days <= 7 ? '#d97706' : '#6b7280', marginTop: 4 }}>
          {days === 0 ? 'פג תוקף היום' : `עוד ${days} ימים`}
        </div>
      )}
    </div>
  )
}
