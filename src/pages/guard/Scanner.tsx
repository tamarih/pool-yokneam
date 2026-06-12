import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { CheckCircle, XCircle, Phone, Users, Search, QrCode } from 'lucide-react'
import toast from 'react-hot-toast'

type Stage = 'input' | 'result'
type SearchMode = 'phone' | 'name' | 'qr'

interface FamilySearchResult {
  id: string
  first_name: string | null
  family_name: string
  phone: string | null
}

interface FamilyResult {
  family: { id: string; family_name: string; first_name: string | null; family_number: string | null; status: string }
  member_count: number
  members: { first_name: string; last_name: string }[]
  membership: { id: string; end_date: string | null; type_label: string | null } | null
  punch_card: { id: string; remaining_entries: number; owner_name: string | null } | null
  last_entry: { id: string; people_count: number; created_at: string; entry_type: string } | null
  is_valid: boolean
  error_message: string | null
}

function minutesAgo(iso: string) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
}

export default function GuardScanner() {
  const { user } = useAuth()
  const [searchMode, setSearchMode] = useState<SearchMode>('phone')
  const qrInputRef = useRef<HTMLInputElement>(null)
  const [phone, setPhone] = useState('')
  const [nameQuery, setNameQuery] = useState('')
  const [nameResults, setNameResults] = useState<FamilySearchResult[]>([])
  const [nameLoading, setNameLoading] = useState(false)
  const [stage, setStage] = useState<Stage>('input')
  const [result, setResult] = useState<FamilyResult | null>(null)
  const [selectedMembers, setSelectedMembers] = useState<number[]>([])
  const [punchCount, setPunchCount] = useState(1)
  const [confirmingPunch, setConfirmingPunch] = useState(false)
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
    setSelectedMembers([])
    setPunchCount(1)
    setStage('result')
  }

  async function scanQR(file: File) {
    setLoading(true)
    setError(null)
    try {
      const jsQR = (await import('jsqr')).default
      const img = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height)
      if (!code) {
        setLoading(false)
        setError('לא זוהה QR בתמונה — נסה שוב')
        return
      }
      const { data, error: rpcError } = await supabase.rpc('get_family_by_qr_token', { p_token: code.data })
      setLoading(false)
      if (rpcError || !data) { setError('שגיאה בחיפוש'); return }
      if (data.error) { setError(data.error); return }
      setResult(data as FamilyResult)
      setSelectedMembers([])
      setPunchCount(1)
      setStage('result')
    } catch {
      setLoading(false)
      setError('לא זוהה QR בתמונה — נסה שוב')
    }
  }

  async function searchByName(q: string) {
    setNameQuery(q)
    if (q.trim().length < 2) { setNameResults([]); return }
    setNameLoading(true)
    const { data } = await supabase
      .from('families')
      .select('id, first_name, family_name, phone')
      .or(`family_name.ilike.%${q}%,first_name.ilike.%${q}%`)
      .limit(8)
    setNameLoading(false)
    setNameResults(data ?? [])
  }

  async function selectFamily(family: FamilySearchResult) {
    setNameResults([])
    setNameQuery(`${family.first_name ?? ''} ${family.family_name}`.trim())
    setLoading(true)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('get_family_by_id', { p_family_id: family.id })
    setLoading(false)
    if (rpcError || !data) { setError('שגיאה בחיפוש'); return }
    if (data.error) { setError(data.error); return }
    setResult(data as FamilyResult)
    setSelectedMembers([])
    setPunchCount(1)
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

  const peopleCount = selectedMembers.length || 1

  async function confirmEntry() {
    if (!result) return
    const count = selectedMembers.length || 1
    if (result.punch_card && !result.membership && result.punch_card.remaining_entries < count) {
      toast.error(`נותרו רק ${result.punch_card.remaining_entries} כניסות`)
      return
    }

    setConfirming(true)
    const entryType = result.membership ? 'membership' : 'punch_card'
    const { data, error: rpcError } = await supabase.rpc('record_entry', {
      p_family_id: result.family.id,
      p_people_count: count,
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
    setSelectedMembers([])
  }

  async function confirmPunch() {
    if (!result?.punch_card) return
    setConfirmingPunch(true)
    const { data, error: rpcError } = await supabase.rpc('record_entry', {
      p_family_id: result.family.id,
      p_people_count: punchCount,
      p_entry_type: 'punch_card',
      p_punch_card_id: result.punch_card.id,
      p_guard_user_id: user?.id ?? null,
    })
    setConfirmingPunch(false)
    if (rpcError || data?.error) {
      toast.error(data?.error ?? 'שגיאה בניקוב')
      return
    }
    toast.success(`🎟️ נוקבו ${punchCount} כניסות`)
    setPhone('')
    setStage('input')
    setResult(null)
    setSelectedMembers([])
    setPunchCount(1)
  }

  function reset() {
    setPhone('')
    setNameQuery('')
    setNameResults([])
    setStage('input')
    setResult(null)
    setError(null)
    setSelectedMembers([])
    setPunchCount(1)
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
            {searchMode === 'phone' ? <Phone size={44} color="#0284c7" /> : <Search size={44} color="#0284c7" />}
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginBottom: 6 }}>בדיקת מנוי</h2>

          {/* Mode toggle */}
          <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 12, padding: 4, marginBottom: 20, gap: 4 }}>
            {([
              { mode: 'phone', label: '📞 טלפון' },
              { mode: 'name', label: '🔍 שם' },
              { mode: 'qr', label: '📷 QR' },
            ] as { mode: SearchMode; label: string }[]).map(({ mode, label }) => (
              <button key={mode} onClick={() => { setSearchMode(mode); setError(null); setNameResults([]) }} style={{
                flex: 1, padding: '10px', border: 'none', borderRadius: 9,
                background: searchMode === mode ? 'white' : 'transparent',
                color: searchMode === mode ? '#1d4ed8' : '#6b7280',
                fontWeight: searchMode === mode ? 700 : 500,
                fontSize: 13, cursor: 'pointer',
                boxShadow: searchMode === mode ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s',
              }}>
                {label}
              </button>
            ))}
          </div>

          {searchMode === 'phone' && (
            <>
              <p style={{ color: '#6b7280', marginBottom: 16, fontSize: 14 }}>הזן מספר טלפון לאימות</p>
              <div style={{ marginBottom: 12 }}>
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
            </>
          )}

          {searchMode === 'name' && (
            <>
              <p style={{ color: '#6b7280', marginBottom: 16, fontSize: 14 }}>הזן שם משפחה או שם פרטי</p>
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <input
                  type="text"
                  value={nameQuery}
                  onChange={e => searchByName(e.target.value)}
                  placeholder="לדוגמה: הופמן"
                  style={{
                    width: '100%', padding: '16px',
                    border: '2px solid #e5e7eb', borderRadius: 14,
                    fontSize: 18, outline: 'none', textAlign: 'right',
                    fontFamily: 'inherit', boxSizing: 'border-box',
                  }}
                  autoFocus
                />
                {nameLoading && (
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 13 }}>מחפש...</span>
                )}
              </div>
              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', color: '#dc2626', fontSize: 14, marginBottom: 12 }}>
                  {error}
                </div>
              )}
              {loading && (
                <div style={{ color: '#6b7280', fontSize: 14, padding: 12 }}>טוען נתונים...</div>
              )}
              {nameResults.length > 0 && (
                <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e5e7eb', overflow: 'hidden', textAlign: 'right' }}>
                  {nameResults.map(f => (
                    <button key={f.id} onClick={() => selectFamily(f)} style={{
                      display: 'block', width: '100%', padding: '14px 16px',
                      border: 'none', borderBottom: '1px solid #f3f4f6',
                      background: 'white', cursor: 'pointer', textAlign: 'right',
                      fontSize: 16, fontWeight: 600, color: '#111827',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                    >
                      {[f.first_name, f.family_name].filter(Boolean).join(' ')}
                      {f.phone && <span style={{ fontSize: 13, color: '#9ca3af', marginRight: 8, fontWeight: 400 }}>{f.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
              {nameQuery.length >= 2 && !nameLoading && nameResults.length === 0 && (
                <div style={{ color: '#9ca3af', fontSize: 14, padding: 12 }}>לא נמצאו תוצאות</div>
              )}
            </>
          )}

          {searchMode === 'qr' && (
            <>
              <p style={{ color: '#6b7280', marginBottom: 20, fontSize: 14 }}>
                סרוק את ה-QR של המנוי
              </p>
              <input
                ref={qrInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) scanQR(f) }}
              />
              <button
                onClick={() => qrInputRef.current?.click()}
                disabled={loading}
                style={{
                  width: '100%', padding: '20px',
                  background: loading ? '#93c5fd' : 'linear-gradient(135deg, #1d4ed8, #0ea5e9)',
                  color: 'white', border: 'none', borderRadius: 14,
                  fontSize: 18, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 14px rgba(14,165,233,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                }}>
                <QrCode size={24} />
                {loading ? 'סורק...' : 'פתח מצלמה לסריקה'}
              </button>
              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', color: '#dc2626', fontSize: 14, marginTop: 12, textAlign: 'center' }}>
                  {error}
                </div>
              )}
            </>
          )}
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
                {result.membership?.type_label && (
                  <div style={{ fontSize: 13, color: '#1d4ed8', fontWeight: 600 }}>{result.membership.type_label}</div>
                )}
                <div style={{ fontSize: 12, color: '#6b7280' }}>מס׳ {result.family.family_number}</div>
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.8)', borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1d4ed8', marginBottom: result.members && result.members.length > 0 ? 8 : 0 }}>
                👥 {result.member_count} אנשים על המנוי
              </div>
              {result.members && result.members.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {result.members.map((mb, i) => (
                    <span key={i} style={{
                      background: '#dbeafe', color: '#1e40af',
                      borderRadius: 8, padding: '4px 10px',
                      fontSize: 13, fontWeight: 600,
                    }}>
                      {mb.first_name} {mb.last_name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {result.punch_card && (() => {
              const remaining = result.punch_card.remaining_entries
              const color = remaining <= 2 ? '#dc2626' : remaining <= 5 ? '#d97706' : '#15803d'
              return (
                <>
                  <div style={{ background: 'rgba(255,255,255,0.9)', borderRadius: 12, padding: '12px 14px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>🎟️ כרטיסייה</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color }}>נותרו {remaining} ניקובים</span>
                  </div>
                  {remaining <= 2 && (
                    <div style={{
                      background: '#fef2f2', border: '2px solid #fca5a5', borderRadius: 12,
                      padding: '12px 14px', marginBottom: 8,
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <span style={{ fontSize: 20 }}>⚠️</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#dc2626' }}>
                        {remaining === 0 ? 'הכרטיסייה נגמרה! יש לרכוש כרטיסייה חדשה' : `נשארו רק ${remaining} ניקובים — כדאי לחדש כרטיסייה`}
                      </span>
                    </div>
                  )}
                </>
              )
            })()}
            {result.membership && (
              <div style={{ background: 'rgba(255,255,255,0.8)', borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#15803d' }}>מנוי בתוקף ✓</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>של {familyLabel}</div>
                </div>
                {result.membership.type_label && (
                  <div style={{ fontSize: 13, color: '#6b7280', marginTop: 3 }}>
                    {result.membership.type_label}
                  </div>
                )}
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
                מי נכנס? (לחץ לסימון)
              </div>

              {result.members && result.members.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                  {result.members.filter((mb, i, arr) =>
                    arr.findIndex(m => m.first_name === mb.first_name) === i
                  ).map((mb, i) => {
                    const selected = selectedMembers.includes(i)
                    const name = mb.first_name
                    return (
                      <button key={i} onClick={() => setSelectedMembers(prev =>
                        prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
                      )} style={{
                        padding: '12px 18px', border: '2px solid',
                        borderColor: selected ? '#16a34a' : '#e5e7eb',
                        borderRadius: 12,
                        background: selected ? '#dcfce7' : 'white',
                        color: selected ? '#15803d' : '#374151',
                        fontWeight: selected ? 800 : 500,
                        fontSize: 15, cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}>
                        {selected ? '✓ ' : ''}{name}
                      </button>
                    )
                  })}
                </div>
              ) : (
                // fallback: no members in DB — show number grid
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                  {[1,2,3,4,5,6,7,8].map(n => (
                    <button key={n} onClick={() => setSelectedMembers(Array.from({length: n}, (_, i) => i))} style={{
                      padding: '14px 8px', border: '2px solid',
                      borderColor: peopleCount === n ? '#1d4ed8' : '#e5e7eb',
                      borderRadius: 12, background: peopleCount === n ? '#dbeafe' : 'white',
                      color: peopleCount === n ? '#1d4ed8' : '#374151',
                      fontWeight: peopleCount === n ? 800 : 500,
                      fontSize: 20, cursor: 'pointer',
                    }}>{n}</button>
                  ))}
                </div>
              )}

              {selectedMembers.length === 0 && result.members && result.members.length > 0 && (
                <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', marginBottom: 12 }}>
                  לא נבחר אף אחד — יירשם כניסה של אדם 1
                </div>
              )}

              {result.punch_card && !result.membership && result.punch_card.remaining_entries < (selectedMembers.length || 1) && (
                <div style={{ background: '#fef2f2', borderRadius: 10, padding: '10px 14px', color: '#dc2626', fontWeight: 600, fontSize: 14, marginBottom: 12, textAlign: 'center' }}>
                  ❌ נותרו רק {result.punch_card.remaining_entries} כניסות
                </div>
              )}

              <button
                onClick={confirmEntry}
                disabled={confirming || (!!result.punch_card && !result.membership && result.punch_card.remaining_entries < (selectedMembers.length || 1))}
                style={{
                  width: '100%', padding: '16px', borderRadius: 14, border: 'none',
                  background: 'linear-gradient(135deg, #16a34a, #22c55e)',
                  color: 'white', fontWeight: 800, fontSize: 17,
                  cursor: confirming ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 14px rgba(34,197,94,0.35)',
                }}>
                {confirming ? 'מאשר...' : selectedMembers.length > 0
                  ? `✅ אשר כניסה — ${result.members?.filter((_, i) => selectedMembers.includes(i)).map(m => m.first_name).join(', ')}`
                  : '✅ אשר כניסה — 1 אדם'
                }
              </button>
            </div>
          )}

          {/* Punch card section — after membership */}
          {result.is_valid && result.punch_card && result.membership && (
            <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '2px solid #fcd34d', marginBottom: 12 }}>
              <div style={{ marginBottom: 12, fontWeight: 700, color: '#92400e', fontSize: 15 }}>
                🎟️ ניקוב כרטיסייה — נותרו {result.punch_card.remaining_entries}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <button onClick={() => setPunchCount(p => Math.max(1, p - 1))} style={{
                  width: 44, height: 44, borderRadius: 10, border: '2px solid #e5e7eb',
                  background: 'white', fontSize: 22, fontWeight: 700, cursor: 'pointer',
                }}>−</button>
                <span style={{ fontSize: 24, fontWeight: 800, minWidth: 40, textAlign: 'center' }}>{punchCount}</span>
                <button onClick={() => setPunchCount(p => Math.min(result.punch_card!.remaining_entries, p + 1))} style={{
                  width: 44, height: 44, borderRadius: 10, border: '2px solid #e5e7eb',
                  background: 'white', fontSize: 22, fontWeight: 700, cursor: 'pointer',
                }}>+</button>
                <span style={{ fontSize: 14, color: '#6b7280' }}>ניקובים</span>
              </div>
              <button onClick={confirmPunch} disabled={confirmingPunch} style={{
                width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #d97706, #f59e0b)',
                color: 'white', fontWeight: 800, fontSize: 16, cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(245,158,11,0.35)',
              }}>
                {confirmingPunch ? 'מנקב...' : `🎟️ נקב ${punchCount} כניסות`}
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
