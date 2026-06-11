import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { CheckCircle, XCircle, Phone, Users } from 'lucide-react'
import toast from 'react-hot-toast'

type Stage = 'input' | 'result'

interface FamilyResult {
  family: { id: string; family_name: string; first_name: string | null; family_number: string | null; status: string }
  member_count: number
  membership: { id: string; end_date: string | null } | null
  punch_card: { id: string; remaining_entries: number } | null
  last_entry: { id: string; people_count: number; created_at: string; entry_type: string } | null
  is_valid: boolean
  error_message: string | null
}

function minutesAgo(iso: string) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
}

export default function GuardScanner() {
  const { user } = useAuth()
  const [phone, setPhone] = useState('')
  const [stage, setStage] = useState<Stage>('input')
  const [result, setResult] = useState<FamilyResult | null>(null)
  const [peopleCount, setPeopleCount] = useState(1)
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function lookup() {
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length < 9) { setError('מספר טלפון לא תקין'); return }
    setError(null)
    setLoading(true)

    const { data, error: rpcError } = await supabase.rpc('get_family_by_phone', { p_phone: cleaned })
    setLoading(false)

    if (rpcError || !data) { setError('שגיאה בחיפוש'); return }
    if (data.error) { setError(data.error); return }

    setResult(data as FamilyResult)
    setPeopleCount(1)
    setStage('result')
  }

  async function cancelPreviousEntry() {
    if (!result?.last_entry) return
    const { data, error } = await supabase.rpc('cancel_entry', { p_entry_id: result.last_entry.id })
    if (error || data?.error) {
      toast.error(data?.error ?? 'שגיאה בביטול הכניסה הקודמת')
      return
    }
    toast.success('הכניסה הקודמת בוטלה')
    // refresh lookup to update punch_card balance + clear last_entry
    const { data: refreshed } = await supabase.rpc('get_family_by_phone', { p_phone: phone.replace(/\D/g, '') })
    if (refreshed && !refreshed.error) setResult(refreshed as FamilyResult)
    else setResult({ ...result, last_entry: null })
  }

  async function confirmEntry() {
    if (!result) return
    if (result.punch_card && !result.membership && result.punch_card.remaining_entries < peopleCount) {
      toast.error(`נותרו רק ${result.punch_card.remaining_entries} כניסות`)
      return
    }

    setConfirming(true)
    const entryType = result.membership ? 'membership' : 'punch_card'
    const { data, error: rpcError } = await supabase.rpc('record_entry', {
      p_family_id: result.family.id,
      p_people_count: peopleCount,
      p_entry_type: entryType,
      p_punch_card_id: entryType === 'punch_card' ? result.punch_card?.id ?? null : null,
      p_guard_user_id: user?.id ?? null,
    })
    setConfirming(false)

    if (rpcError || data?.error) {
      toast.error(data?.error ?? 'שגיאה ברישום כניסה')
      return
    }

    toast.success(`✅ כניסה אושרה — ${result.family.family_name}`)
    setPhone('')
    setStage('input')
    setResult(null)
    setPeopleCount(1)
  }

  function reset() {
    setPhone('')
    setStage('input')
    setResult(null)
    setError(null)
    setPeopleCount(1)
  }

  const familyLabel = result ? [result.family.first_name, result.family.family_name].filter(Boolean).join(' ') : ''

  return (
    <div style={{ direction: 'rtl' }}>

      {/* STAGE: input */}
      {stage === 'input' && (
        <div style={{ textAlign: 'center', paddingTop: 20 }}>
          <div style={{
            width: 100, height: 100, borderRadius: '50%',
            background: 'linear-gradient(135deg, #dbeafe, #e0f2fe)',
            margin: '0 auto 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(14,165,233,0.2)',
          }}>
            <Phone size={44} color="#0284c7" />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginBottom: 6 }}>בדיקת מנוי</h2>
          <p style={{ color: '#6b7280', marginBottom: 24, fontSize: 14 }}>הזן מספר טלפון לאימות</p>

          <div style={{ position: 'relative', marginBottom: 12 }}>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && lookup()}
              placeholder="050-0000000"
              style={{
                width: '100%', padding: '16px',
                border: '2px solid #e5e7eb', borderRadius: 14,
                fontSize: 22, outline: 'none', direction: 'ltr', textAlign: 'center',
                fontFamily: 'inherit', boxSizing: 'border-box',
              }}
              autoFocus
            />
          </div>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', color: '#dc2626', fontSize: 14, marginBottom: 12 }}>
              {error}
            </div>
          )}

          <button onClick={lookup} disabled={loading} style={{
            width: '100%', padding: '16px',
            background: loading ? '#93c5fd' : 'linear-gradient(135deg, #1d4ed8, #0ea5e9)',
            color: 'white', border: 'none', borderRadius: 14,
            fontSize: 18, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 14px rgba(14,165,233,0.35)',
          }}>
            {loading ? 'מחפש...' : 'חפש מנוי'}
          </button>
        </div>
      )}

      {/* STAGE: result */}
      {stage === 'result' && result && (
        <div style={{ animation: 'fadeIn 0.3s ease' }}>
          <div style={{
            background: result.is_valid ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)' : 'linear-gradient(135deg, #fef2f2, #fee2e2)',
            borderRadius: 20, padding: 20,
            border: `2px solid ${result.is_valid ? '#86efac' : '#fca5a5'}`,
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: result.is_valid ? '#16a34a' : '#dc2626',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {result.is_valid ? <CheckCircle size={26} color="white" /> : <XCircle size={26} color="white" />}
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#111827' }}>{familyLabel}</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>מס׳ {result.family.family_number}</div>
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.8)', borderRadius: 10, padding: '10px 14px', fontSize: 14, fontWeight: 700, color: '#1d4ed8', marginBottom: 8 }}>
              👥 {result.member_count} אנשים על המנוי
            </div>

            {result.punch_card && !result.membership && (
              <div style={{ background: 'rgba(255,255,255,0.8)', borderRadius: 10, padding: '10px 14px', fontSize: 14, fontWeight: 700, color: result.punch_card.remaining_entries <= 3 ? '#d97706' : '#15803d', marginBottom: 8 }}>
                כרטיסייה — נותרו {result.punch_card.remaining_entries} כניסות
              </div>
            )}
            {result.membership && (
              <div style={{ background: 'rgba(255,255,255,0.8)', borderRadius: 10, padding: '10px 14px', fontSize: 14, fontWeight: 700, color: '#15803d', marginBottom: 8 }}>
                מנוי בתוקף ✓
              </div>
            )}

            {!result.is_valid && (
              <div style={{ background: '#dc2626', borderRadius: 10, padding: '10px 14px', color: 'white', fontWeight: 700, textAlign: 'center' }}>
                ❌ {result.error_message}
              </div>
            )}
          </div>

          {result.is_valid && result.last_entry && (
            <div style={{
              background: '#fffbeb', border: '2px solid #fcd34d', borderRadius: 14,
              padding: 16, marginBottom: 12,
            }}>
              <div style={{ fontWeight: 800, color: '#92400e', fontSize: 15, marginBottom: 8 }}>
                ⚠️ המשפחה כבר נכנסה לפני {minutesAgo(result.last_entry.created_at)} דקות
              </div>
              <div style={{ fontSize: 13, color: '#78350f', marginBottom: 12 }}>
                ({result.last_entry.people_count} {result.last_entry.people_count === 1 ? 'אדם' : 'אנשים'}). אם הייתה טעות — אפשר לבטל ולרשום מחדש.
              </div>
              <button
                onClick={cancelPreviousEntry}
                style={{
                  width: '100%', padding: '12px', borderRadius: 10, border: 'none',
                  background: '#f59e0b', color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                }}>
                🗑️ בטל את הכניסה הקודמת
              </button>
            </div>
          )}

          {result.is_valid && (
            <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #e5e7eb', marginBottom: 12 }}>
              <div style={{ marginBottom: 12, fontWeight: 700, color: '#374151', fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Users size={16} />
                כמה אנשים נכנסים?
              </div>

              {result.punch_card && !result.membership && result.punch_card.remaining_entries < peopleCount && (
                <div style={{ background: '#fef2f2', borderRadius: 10, padding: '10px 14px', color: '#dc2626', fontWeight: 600, fontSize: 14, marginBottom: 12, textAlign: 'center' }}>
                  ❌ נותרו רק {result.punch_card.remaining_entries} כניסות
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
                    fontSize: 20, cursor: 'pointer',
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
            width: '100%', padding: '12px',
            background: '#f3f4f6', border: 'none', borderRadius: 12,
            fontWeight: 600, fontSize: 14, cursor: 'pointer', color: '#6b7280',
          }}>
            חיפוש חדש
          </button>
        </div>
      )}
    </div>
  )
}
