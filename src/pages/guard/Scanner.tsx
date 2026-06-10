import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { QRScanResult } from '@/types'
import { membershipTypeLabel, formatDate, formatDateTime, daysUntil } from '@/utils/format'
import { QrCode, CheckCircle, XCircle, AlertTriangle, Users, Camera, CameraOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { Html5Qrcode } from 'html5-qrcode'

type ScanState = 'idle' | 'scanning' | 'result' | 'confirm'

export default function GuardScanner() {
  const { user } = useAuth()
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [result, setResult] = useState<QRScanResult | null>(null)
  const [peopleCount, setPeopleCount] = useState(1)
  const [confirming, setConfirming] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const scannerDivId = 'qr-scanner-div'

  useEffect(() => {
    return () => { stopScanner() }
  }, [])

  async function startScanner() {
    setCameraError(null)
    setScanState('scanning')
    try {
      const scanner = new Html5Qrcode(scannerDivId)
      scannerRef.current = scanner

      const devices = await Html5Qrcode.getCameras()
      if (!devices || devices.length === 0) throw new Error('לא נמצאה מצלמה')

      // prefer back camera
      const backCamera = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('אחורית')) ?? devices[devices.length - 1]

      await scanner.start(
        backCamera.id,
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          stopScanner()
          handleQRResult(decodedText)
        },
        () => {}
      )
    } catch (err: any) {
      setCameraError(err.message || 'שגיאה בפתיחת מצלמה')
      setScanState('idle')
    }
  }

  function stopScanner() {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {})
      scannerRef.current = null
    }
  }

  async function handleQRResult(token: string) {
    const { data, error } = await supabase.rpc('get_family_by_qr', { p_token: token })
    if (error || data?.error) {
      toast.error(data?.error ?? 'שגיאה בסריקה')
      setScanState('idle')
      return
    }

    const family = data.family
    const membership = data.membership ?? null
    const punchCard = data.punch_card ?? null
    const lastEntry = data.last_entry ?? null

    const hasValidMembership = membership !== null
    const hasPunchCard = punchCard !== null && punchCard.remaining_entries > 0

    setResult({
      family,
      membership,
      punch_card: punchCard,
      last_entry: lastEntry,
      is_valid: family.status === 'active' && (hasValidMembership || hasPunchCard),
      error_message: family.status !== 'active'
        ? 'המשפחה אינה פעילה'
        : (!hasValidMembership && !hasPunchCard)
          ? 'אין מנוי פעיל או כרטיסייה בתוקף'
          : null,
    })
    setPeopleCount(1)
    setScanState('result')
  }

  async function confirmEntry() {
    if (!result) return

    // check punch card has enough
    if (result.punch_card && result.membership === null) {
      if (result.punch_card.remaining_entries < peopleCount) {
        toast.error(`אין מספיק כניסות. נותרו: ${result.punch_card.remaining_entries}`)
        return
      }
    }

    setConfirming(true)
    const entryType = result.membership ? 'membership' : 'punch_card'
    const { data, error } = await supabase.rpc('record_entry', {
      p_family_id: result.family.id,
      p_people_count: peopleCount,
      p_entry_type: entryType,
      p_punch_card_id: entryType === 'punch_card' ? result.punch_card?.id ?? null : null,
      p_guard_user_id: user?.id ?? null,
    })

    setConfirming(false)
    if (error || data?.error) {
      toast.error(data?.error ?? 'שגיאה ברישום כניסה')
    } else {
      setScanState('confirm')
      setTimeout(() => { setScanState('idle'); setResult(null) }, 4000)
    }
  }

  function reset() {
    stopScanner()
    setScanState('idle')
    setResult(null)
    setPeopleCount(1)
  }

  const days = result ? daysUntil(result.family.end_date) : null
  const isExpiringSoon = days !== null && days >= 0 && days <= 7

  return (
    <div style={{ direction: 'rtl' }}>

      {/* IDLE */}
      {scanState === 'idle' && (
        <div style={{ textAlign: 'center', paddingTop: 40 }}>
          <div style={{
            width: 120, height: 120, borderRadius: '50%',
            background: 'linear-gradient(135deg, #dbeafe, #e0f2fe)',
            margin: '0 auto 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(14,165,233,0.2)',
          }}>
            <QrCode size={56} color="#0284c7" />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginBottom: 8 }}>סריקת QR</h2>
          <p style={{ color: '#6b7280', marginBottom: 32 }}>לחץ לסריקת כרטיס משפחה</p>

          {cameraError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', color: '#dc2626', fontSize: 14, marginBottom: 20, textAlign: 'center' }}>
              {cameraError}
            </div>
          )}

          <button onClick={startScanner} style={{
            background: 'linear-gradient(135deg, #1d4ed8, #0ea5e9)',
            color: 'white', border: 'none', borderRadius: 16,
            padding: '18px 48px', fontSize: 18, fontWeight: 700,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10,
            boxShadow: '0 6px 20px rgba(14,165,233,0.4)',
          }}>
            <Camera size={22} />
            סרוק QR
          </button>
        </div>
      )}

      {/* SCANNING */}
      {scanState === 'scanning' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: 16 }}>
            <p style={{ color: '#6b7280', fontSize: 15 }}>כוון את המצלמה לקוד QR</p>
          </div>
          <div id={scannerDivId} style={{ borderRadius: 16, overflow: 'hidden', maxWidth: 400, margin: '0 auto' }} />
          <button onClick={reset} style={{
            marginTop: 20, padding: '12px 28px', background: '#f3f4f6', border: 'none',
            borderRadius: 12, cursor: 'pointer', fontSize: 15, fontWeight: 600, color: '#374151',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
            <CameraOff size={16} />
            ביטול
          </button>
        </div>
      )}

      {/* RESULT */}
      {scanState === 'result' && result && (
        <div style={{ animation: 'fadeIn 0.3s ease' }}>
          {/* Duplicate scan warning */}
          {result.last_entry && (
            <div style={{
              background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12,
              padding: '12px 16px', marginBottom: 16,
              display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <AlertTriangle size={20} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontWeight: 700, color: '#92400e', fontSize: 14 }}>⚠️ כרטיס נסרק לאחרונה</div>
                <div style={{ color: '#b45309', fontSize: 13, marginTop: 2 }}>
                  נסרק ב-{formatDateTime(result.last_entry.created_at)} — {result.last_entry.people_count} אנשים
                </div>
              </div>
            </div>
          )}

          {/* Family card */}
          <div style={{
            background: result.is_valid ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)' : 'linear-gradient(135deg, #fef2f2, #fee2e2)',
            borderRadius: 20, padding: '20px',
            border: `2px solid ${result.is_valid ? '#86efac' : '#fca5a5'}`,
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: result.is_valid ? '#16a34a' : '#dc2626',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {result.is_valid ? <CheckCircle size={26} color="white" /> : <XCircle size={26} color="white" />}
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#111827' }}>{result.family.family_name}</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>מס׳ {result.family.family_number}</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <InfoRow label="סוג מנוי" value={membershipTypeLabel(result.family.membership_type)} />
              {result.family.end_date && (
                <InfoRow
                  label="תוקף"
                  value={formatDate(result.family.end_date)}
                  valueColor={isExpiringSoon ? '#d97706' : undefined}
                />
              )}
              {result.punch_card && (
                <InfoRow
                  label="יתרת כניסות"
                  value={`${result.punch_card.remaining_entries} כניסות`}
                  valueColor={result.punch_card.remaining_entries <= 3 ? '#d97706' : '#16a34a'}
                />
              )}
            </div>

            {!result.is_valid && (
              <div style={{ marginTop: 12, background: '#dc2626', borderRadius: 10, padding: '10px 14px', color: 'white', fontWeight: 700, textAlign: 'center', fontSize: 15 }}>
                ❌ {result.error_message}
              </div>
            )}
          </div>

          {/* People count selector + confirm */}
          {result.is_valid && (
            <div style={{ background: 'white', borderRadius: 16, padding: '20px', border: '1px solid #e5e7eb' }}>
              <div style={{ marginBottom: 14, fontWeight: 700, color: '#374151', fontSize: 15 }}>
                <Users size={16} style={{ display: 'inline', marginLeft: 6 }} />
                כמה אנשים נכנסים?
              </div>

              {/* Check punch card */}
              {result.punch_card && !result.membership && result.punch_card.remaining_entries < peopleCount && (
                <div style={{ background: '#fef2f2', borderRadius: 10, padding: '10px 14px', color: '#dc2626', fontWeight: 600, fontSize: 14, marginBottom: 12, textAlign: 'center' }}>
                  ❌ אין מספיק כניסות בכרטיסייה (נותרו {result.punch_card.remaining_entries})
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                {[1,2,3,4,5,6,7,8].map(n => (
                  <button key={n} onClick={() => setPeopleCount(n)} style={{
                    padding: '14px 8px', border: '2px solid',
                    borderColor: peopleCount === n ? '#1d4ed8' : '#e5e7eb',
                    borderRadius: 12, background: peopleCount === n ? '#dbeafe' : 'white',
                    color: peopleCount === n ? '#1d4ed8' : '#374151',
                    fontWeight: peopleCount === n ? 800 : 500,
                    fontSize: 20, cursor: 'pointer', transition: 'all 0.1s',
                  }}>{n}</button>
                ))}
              </div>

              <button
                onClick={confirmEntry}
                disabled={confirming || (!!result.punch_card && !result.membership && result.punch_card.remaining_entries < peopleCount)}
                style={{
                  width: '100%', padding: '16px', borderRadius: 14, border: 'none',
                  background: 'linear-gradient(135deg, #16a34a, #22c55e)',
                  color: 'white', fontWeight: 800, fontSize: 17,
                  cursor: confirming ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 14px rgba(34,197,94,0.35)',
                }}>
                {confirming ? 'מאשר...' : `✅ אשר כניסה — ${peopleCount} ${peopleCount === 1 ? 'אדם' : 'אנשים'}`}
              </button>
            </div>
          )}

          <button onClick={reset} style={{
            width: '100%', marginTop: 12, padding: '12px',
            background: '#f3f4f6', border: 'none', borderRadius: 12,
            fontWeight: 600, fontSize: 14, cursor: 'pointer', color: '#6b7280',
          }}>
            סרוק QR אחר
          </button>
        </div>
      )}

      {/* CONFIRM SUCCESS */}
      {scanState === 'confirm' && (
        <div style={{ textAlign: 'center', paddingTop: 40, animation: 'scaleIn 0.3s ease' }}>
          <div style={{
            width: 120, height: 120, borderRadius: '50%',
            background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)',
            margin: '0 auto 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(34,197,94,0.3)',
          }}>
            <CheckCircle size={60} color="#16a34a" />
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 900, color: '#16a34a', marginBottom: 8 }}>✅ כניסה מאושרת!</h2>
          <p style={{ fontSize: 18, color: '#374151', fontWeight: 600 }}>
            {result?.family.family_name} — {peopleCount} {peopleCount === 1 ? 'אדם' : 'אנשים'}
          </p>
          <p style={{ color: '#9ca3af', marginTop: 24, fontSize: 13 }}>חוזר אוטומטית בעוד 4 שניות...</p>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.7)', borderRadius: 8, padding: '8px 12px', fontSize: 14 }}>
      <span style={{ color: '#6b7280' }}>{label}</span>
      <span style={{ fontWeight: 700, color: valueColor ?? '#111827' }}>{value}</span>
    </div>
  )
}
