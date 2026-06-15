import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { CheckCircle, XCircle, Phone } from 'lucide-react'

type Stage = 'input' | 'result' | 'confirmed'

interface FamilyResult {
  family: {
    id: string
    family_name: string
    first_name: string | null
    family_number: string | null
    status: string
  }
  membership: { id: string; end_date: string | null } | null
  punch_card: { id: string; remaining_entries: number } | null
  last_entry: { id: string; people_count: number; created_at: string; entry_type: string } | null
  is_valid: boolean
  error_message: string | null
}

function minutesAgo(iso: string) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
}

export default function EntryPage() {
  const [phone, setPhone] = useState('')
  const [stage, setStage] = useState<Stage>('input')
  const [result, setResult] = useState<FamilyResult | null>(null)
  const [options, setOptions] = useState<FamilyResult[]>([])
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function lookup() {
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length < 9) { setError('מספר טלפון לא תקין'); return }
    setError(null)
    setLoading(true)

    const { data, error: rpcError } = await supabase.rpc('get_family_options_by_phone', { p_phone: cleaned })
    setLoading(false)

    if (rpcError || !data) {
      setError('שגיאה בחיפוש, נסה שנית')
      return
    }
    if (data.error) {
      setError(data.error)
      return
    }

    const opts = (data.options ?? []) as FamilyResult[]
    if (opts.length === 0) {
      setError('אין מנוי או כרטיסייה משויכים לטלפון זה')
      return
    }
    if (opts.length === 1) {
      setResult(opts[0])
      setOptions([])
      setStage('result')
    } else {
      setOptions(opts)
      setResult(null)
    }
  }

  function chooseOption(opt: FamilyResult) {
    setResult(opt)
    setOptions([])
    setStage('result')
  }

  async function cancelPreviousEntry() {
    if (!result?.last_entry) return
    const { data, error: rpcError } = await supabase.rpc('cancel_entry', { p_entry_id: result.last_entry.id })
    if (rpcError || data?.error) {
      setError(data?.error ?? 'שגיאה בביטול הכניסה הקודמת')
      return
    }
    const { data: refreshed } = await supabase.rpc('get_family_by_phone', { p_phone: phone.replace(/\D/g, '') })
    if (refreshed && !refreshed.error) setResult(refreshed as FamilyResult)
    else setResult({ ...result, last_entry: null })
  }

  async function confirmEntry() {
    if (!result) return
    setConfirming(true)

    const entryType = result.membership ? 'membership' : 'punch_card'
    const { data, error: rpcError } = await supabase.rpc('record_entry_public', {
      p_family_id: result.family.id,
      p_people_count: 1,
      p_entry_type: entryType,
      p_punch_card_id: entryType === 'punch_card' ? result.punch_card?.id ?? null : null,
    })

    setConfirming(false)
    if (rpcError || data?.error) {
      setError(data?.error ?? 'שגיאה ברישום כניסה')
      return
    }
    setStage('confirmed')
  }

  function reset() {
    setPhone('')
    setStage('input')
    setResult(null)
    setError(null)
  }

  const familyLabel = result
    ? [result.family.first_name, result.family.family_name].filter(Boolean).join(' ')
    : ''

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #eff6ff 0%, #e0f2fe 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, direction: 'rtl',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Logo / Title */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'linear-gradient(135deg, #1d4ed8, #0ea5e9)',
            margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(14,165,233,0.35)',
          }}>
            <span style={{ fontSize: 36 }}>🏊</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1e3a5f', margin: 0 }}>בריכת יקנעם</h1>
          <p style={{ color: '#64748b', fontSize: 14, marginTop: 6 }}>כניסה למנויים</p>
        </div>

        {/* STAGE: input */}
        {stage === 'input' && (
          <div style={{ background: 'white', borderRadius: 20, padding: 28, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
            <p style={{ fontSize: 15, color: '#374151', marginBottom: 20, textAlign: 'center' }}>
              הזן את מספר הטלפון הרשום במערכת
            </p>

            <div style={{ position: 'relative', marginBottom: 16 }}>
              <Phone size={18} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && lookup()}
                placeholder="050-0000000"
                style={{
                  width: '100%', padding: '14px 44px 14px 14px',
                  border: '2px solid #e5e7eb', borderRadius: 12,
                  fontSize: 18, outline: 'none', direction: 'ltr', textAlign: 'center',
                  fontFamily: 'inherit', boxSizing: 'border-box',
                }}
                autoFocus
              />
            </div>

            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', color: '#dc2626', fontSize: 14, marginBottom: 14, textAlign: 'center' }}>
                {error}
              </div>
            )}

            <button
              onClick={lookup}
              disabled={loading}
              style={{
                width: '100%', padding: '16px',
                background: loading ? '#93c5fd' : 'linear-gradient(135deg, #1d4ed8, #0ea5e9)',
                color: 'white', border: 'none', borderRadius: 12,
                fontSize: 17, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 14px rgba(14,165,233,0.35)',
              }}
            >
              {loading ? 'מחפש...' : 'כניסה לבריכה'}
            </button>

            {options.length > 1 && (
              <div style={{ marginTop: 16, background: '#fffbeb', border: '2px solid #fcd34d', borderRadius: 12, padding: 14, textAlign: 'right' }}>
                <div style={{ fontWeight: 800, color: '#92400e', fontSize: 14, marginBottom: 10 }}>
                  ⚠️ נמצאו {options.length} מנויים בטלפון זה. בחר/י את שלך:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {options.map((o, i) => {
                    const name = [o.family.first_name, o.family.family_name].filter(Boolean).join(' ')
                    const what = o.membership ? '🎫 מנוי' : `🎟 כרטיסייה (${o.punch_card?.remaining_entries ?? 0} נותרו)`
                    return (
                      <button key={i} onClick={() => chooseOption(o)} style={{
                        background: 'white', border: '2px solid #f59e0b', borderRadius: 10,
                        padding: '12px 14px', cursor: 'pointer', textAlign: 'right',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        fontSize: 15, fontWeight: 600, color: '#111827',
                      }}>
                        <span>{name}</span>
                        <span style={{ color: '#92400e', fontSize: 13 }}>{what}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* STAGE: result */}
        {stage === 'result' && result && (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <div style={{
              background: result.is_valid
                ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)'
                : 'linear-gradient(135deg, #fef2f2, #fee2e2)',
              borderRadius: 20, padding: 28,
              border: `3px solid ${result.is_valid ? '#86efac' : '#fca5a5'}`,
              boxShadow: `0 8px 32px ${result.is_valid ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
              textAlign: 'center', marginBottom: 16,
            }}>
              <div style={{ marginBottom: 16 }}>
                {result.is_valid
                  ? <CheckCircle size={72} color="#16a34a" style={{ margin: '0 auto' }} />
                  : <XCircle size={72} color="#dc2626" style={{ margin: '0 auto' }} />}
              </div>

              <div style={{ fontSize: 26, fontWeight: 900, color: '#111827', marginBottom: 4 }}>
                {familyLabel}
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
                מס׳ {result.family.family_number}
              </div>

              {result.is_valid ? (
                <>
                  {result.last_entry && (
                    <div style={{
                      background: '#fffbeb', border: '2px solid #fcd34d', borderRadius: 12,
                      padding: 14, marginBottom: 16, textAlign: 'right',
                    }}>
                      <div style={{ fontWeight: 800, color: '#92400e', fontSize: 14, marginBottom: 6 }}>
                        ⚠️ כבר נכנסת לפני {minutesAgo(result.last_entry.created_at)} דקות
                      </div>
                      <div style={{ fontSize: 12, color: '#78350f', marginBottom: 10 }}>
                        ({result.last_entry.people_count} {result.last_entry.people_count === 1 ? 'אדם' : 'אנשים'}). אם זו הייתה טעות — לחץ לביטול ורישום חדש.
                      </div>
                      <button onClick={cancelPreviousEntry} style={{
                        width: '100%', padding: '10px', borderRadius: 10, border: 'none',
                        background: '#f59e0b', color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                      }}>
                        🗑️ בטל את הכניסה הקודמת
                      </button>
                    </div>
                  )}
                  {result.punch_card && !result.membership && (
                    <div style={{
                      background: 'rgba(255,255,255,0.8)', borderRadius: 12, padding: '12px 16px',
                      marginBottom: 20, fontSize: 16, fontWeight: 700, color: '#15803d',
                    }}>
                      כרטיסייה — נותרו {result.punch_card.remaining_entries} כניסות
                    </div>
                  )}
                  {result.membership && (
                    <div style={{
                      background: 'rgba(255,255,255,0.8)', borderRadius: 12, padding: '12px 16px',
                      marginBottom: 20, fontSize: 16, fontWeight: 700, color: '#15803d',
                    }}>
                      מנוי בתוקף ✓
                    </div>
                  )}

                  <button
                    onClick={confirmEntry}
                    disabled={confirming}
                    style={{
                      width: '100%', padding: '18px',
                      background: confirming ? '#86efac' : 'linear-gradient(135deg, #15803d, #22c55e)',
                      color: 'white', border: 'none', borderRadius: 14,
                      fontSize: 20, fontWeight: 800, cursor: confirming ? 'not-allowed' : 'pointer',
                      boxShadow: '0 6px 20px rgba(34,197,94,0.4)',
                    }}
                  >
                    {confirming ? 'נרשם...' : '✅ כנס לבריכה'}
                  </button>
                </>
              ) : (
                <div style={{
                  background: '#dc2626', borderRadius: 12, padding: '14px',
                  color: 'white', fontWeight: 800, fontSize: 16,
                }}>
                  ❌ {result.error_message}
                </div>
              )}
            </div>

            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', color: '#dc2626', fontSize: 14, marginBottom: 12, textAlign: 'center' }}>
                {error}
              </div>
            )}

            <button onClick={reset} style={{
              width: '100%', padding: '14px',
              background: 'white', border: '2px solid #e5e7eb', borderRadius: 12,
              fontSize: 15, fontWeight: 600, cursor: 'pointer', color: '#6b7280',
            }}>
              חזור
            </button>
          </div>
        )}

        {/* STAGE: confirmed */}
        {stage === 'confirmed' && result && (
          <div style={{ textAlign: 'center', animation: 'scaleIn 0.3s ease' }}>
            <div style={{
              width: 140, height: 140, borderRadius: '50%',
              background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)',
              margin: '0 auto 24px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 12px 40px rgba(34,197,94,0.35)',
            }}>
              <CheckCircle size={80} color="#16a34a" />
            </div>
            <h2 style={{ fontSize: 32, fontWeight: 900, color: '#15803d', marginBottom: 8 }}>
              כניסה מאושרת!
            </h2>
            <p style={{ fontSize: 20, color: '#374151', fontWeight: 700, marginBottom: 8 }}>
              {familyLabel}
            </p>
            {result.punch_card && !result.membership && (
              <p style={{ fontSize: 15, color: '#6b7280' }}>
                נותרו {result.punch_card.remaining_entries - 1} כניסות בכרטיסייה
              </p>
            )}
            <p style={{ color: '#9ca3af', marginTop: 32, fontSize: 14 }}>תהנו מהבריכה! 🌊</p>

            <button onClick={reset} style={{
              marginTop: 24, padding: '14px 32px',
              background: 'white', border: '2px solid #e5e7eb', borderRadius: 12,
              fontSize: 15, fontWeight: 600, cursor: 'pointer', color: '#6b7280',
            }}>
              כניסה נוספת
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  )
}
