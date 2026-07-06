import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Family, FamilyMember, Membership, PunchCard, Entry } from '@/types'
import { formatDate, formatTime, membershipTypeLabel, statusLabel, statusColor, entryTypeLabel } from '@/utils/format'
import { ArrowRight, Edit2, UserPlus, Plus, RefreshCw, XCircle, QrCode, Trash2 } from 'lucide-react'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import FamilyFormModal from '@/components/admin/FamilyFormModal'
import FamilyQRCard from '@/components/shared/FamilyQRCard'
import toast from 'react-hot-toast'

export default function AdminFamilyDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [family, setFamily] = useState<Family | null>(null)
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [punchCards, setPunchCards] = useState<PunchCard[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [showEditFamily, setShowEditFamily] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [tab, setTab] = useState<'members' | 'memberships' | 'punch_cards' | 'entries'>('members')
  const [addPunchEntries, setAddPunchEntries] = useState(0)
  const [addPunchExpiry, setAddPunchExpiry] = useState('')
  const [addPunchPhone, setAddPunchPhone] = useState('')

  useEffect(() => { if (id) load() }, [id])

  async function load() {
    setLoading(true)
    const [fam, mem, ship, punch, ent] = await Promise.all([
      supabase.from('families').select('*').eq('id', id!).single(),
      supabase.from('family_members').select('*').eq('family_id', id!).order('first_name'),
      supabase.from('memberships').select('*').eq('family_id', id!).order('created_at', { ascending: false }),
      supabase.from('punch_cards').select('*').eq('family_id', id!).order('created_at', { ascending: false }),
      supabase.from('entries').select('*').eq('family_id', id!).order('created_at', { ascending: false }).limit(50),
    ])
    setFamily(fam.data)
    setMembers(mem.data ?? [])
    setMemberships(ship.data ?? [])
    setPunchCards(punch.data ?? [])
    setEntries(ent.data ?? [])
    setLoading(false)
  }

  async function cancelEntry(entryId: string) {
    if (!confirm('לבטל כניסה זו?')) return
    const { error } = await supabase.from('entries').update({ status: 'cancelled' }).eq('id', entryId)
    if (error) toast.error('שגיאה בביטול')
    else { toast.success('הכניסה בוטלה'); load() }
  }

  async function addPunchCard() {
    if (addPunchEntries < 1) return toast.error('הכנס מספר כניסות')
    const { error } = await supabase.from('punch_cards').insert({
      family_id: id,
      purchased_entries: addPunchEntries,
      used_entries: 0,
      expiry_date: addPunchExpiry || null,
      phone: addPunchPhone.trim() || null,
    })
    if (error) toast.error('שגיאה: ' + error.message)
    else { toast.success('כרטיסייה נוספה'); setAddPunchEntries(0); setAddPunchExpiry(''); setAddPunchPhone(''); load() }
  }

  const [retroFor, setRetroFor] = useState<string | null>(null) // punch_card id
  const [retroDate, setRetroDate] = useState(new Date().toISOString().slice(0, 10))
  const [retroTime, setRetroTime] = useState('12:00')
  const [retroCount, setRetroCount] = useState(1)

  async function addRetroactiveEntry(pcId: string, pcRemaining: number) {
    if (retroCount < 1) return toast.error('מספר אנשים לא תקין')
    if (retroCount > pcRemaining) return toast.error(`נותרו רק ${pcRemaining} כניסות`)
    const { data, error } = await supabase.rpc('record_entry', {
      p_family_id: id,
      p_people_count: retroCount,
      p_entry_type: 'punch_card',
      p_punch_card_id: pcId,
      p_entry_date: retroDate,
      p_entry_time: retroTime,
      p_notes: 'נוסף ידנית ע״י אדמין',
    })
    if (error || data?.error) toast.error(data?.error ?? 'שגיאה בהוספה')
    else {
      toast.success(`נוסף ${retroCount} כניסות ב-${retroDate}`)
      setRetroFor(null); setRetroCount(1)
      load()
    }
  }

  async function addMembership() {
    if (!family) return
    const today = new Date().toISOString().slice(0, 10)
    const seasonEnd = new Date(new Date().getFullYear(), 9, 31).toISOString().slice(0, 10)
    const { error } = await supabase.from('memberships').insert({
      family_id: family.id,
      type: family.membership_type ?? 'seasonal',
      start_date: today,
      end_date: family.end_date ?? seasonEnd,
      active: true,
    })
    if (error) toast.error('שגיאה: ' + error.message)
    else { toast.success('מנוי נוצר'); load() }
  }

  async function updateMembershipPhones(membershipId: string, phones: string[]) {
    const { error } = await supabase.from('memberships').update({ phones }).eq('id', membershipId)
    if (error) toast.error('שגיאה בעדכון')
    else { toast.success('הטלפונים עודכנו'); load() }
  }

  async function updatePunchCardPhones(pcId: string, phones: string[]) {
    const { error } = await supabase.from('punch_cards').update({ phones }).eq('id', pcId)
    if (error) toast.error('שגיאה בעדכון')
    else { toast.success('הטלפונים עודכנו'); load() }
  }

  async function deletePunchCard(pcId: string, used: number) {
    const msg = used > 0
      ? `הכרטיסייה הזו שומשה ${used} פעמים. למחוק לצמיתות? (היסטוריית הכניסות תישמר אבל הקישור לכרטיסייה יישבר)`
      : 'למחוק את הכרטיסייה לצמיתות?'
    if (!confirm(msg)) return
    const { error } = await supabase.from('punch_cards').delete().eq('id', pcId)
    if (error) toast.error('שגיאה: ' + error.message)
    else { toast.success('הכרטיסייה נמחקה'); load() }
  }

  if (loading) return <LoadingSpinner />
  if (!family) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>משפחה לא נמצאה</div>

  const sc = statusColor(family.status)

  return (
    <div style={{ padding: '24px 28px', direction: 'rtl' }}>
      {/* Back */}
      <button onClick={() => navigate('/admin/families')} style={{
        display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
        cursor: 'pointer', color: '#6b7280', fontSize: 14, marginBottom: 20, padding: 0,
      }}>
        <ArrowRight size={16} />
        חזרה לרשימה
      </button>

      {/* Family header */}
      <div style={{
        background: 'white', borderRadius: 16, padding: '20px 24px',
        marginBottom: 20, border: '1px solid #f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827' }}>{family.family_name}</h1>
            <span style={{ ...sc, padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{statusLabel(family.status)}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', color: '#6b7280', fontSize: 14 }}>
            <span>מס׳ {family.family_number}</span>
            <span>📞 {family.phone}</span>
            <span>📍 {family.address}</span>
            <span>🏷️ {membershipTypeLabel(family.membership_type)}</span>
            {family.end_date && <span>📅 תוקף: {formatDate(family.end_date)}</span>}
          </div>
          {family.notes && <p style={{ marginTop: 8, fontSize: 13, color: '#6b7280', fontStyle: 'italic' }}>{family.notes}</p>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowQR(true)} style={btnStyle('#0ea5e9', '#e0f2fe')}>
            <QrCode size={16} /> QR
          </button>
          <button onClick={() => setShowEditFamily(true)} style={btnStyle('#1d4ed8', '#dbeafe')}>
            <Edit2 size={16} /> עריכה
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'white', borderRadius: 12, padding: 4, width: 'fit-content', border: '1px solid #f3f4f6' }}>
        {([
          ['members', `חברי משפחה (${members.length})`],
          ['memberships', `מנויים (${memberships.length})`],
          ['punch_cards', `כרטיסיות (${punchCards.length})`],
          ['entries', `כניסות (${entries.length})`],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: tab === key ? '#1d4ed8' : 'transparent',
            color: tab === key ? 'white' : '#6b7280',
            transition: 'all 0.15s',
          }}>{label}</button>
        ))}
      </div>

      {/* Members tab */}
      {tab === 'members' && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontWeight: 700 }}>חברי משפחה</h3>
            <button onClick={() => { /* TODO: add member modal */ }} style={btnStyle('#16a34a', '#dcfce7')}>
              <UserPlus size={15} /> הוסף
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Head of family from families table */}
            {family.first_name && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f9fafb' }}>
                <span style={{ fontWeight: 600 }}>{family.first_name} {family.family_name}</span>
                <span style={{ fontSize: 12, color: '#1d4ed8', background: '#dbeafe', padding: '2px 8px', borderRadius: 10 }}>ראש משפחה</span>
              </div>
            )}
            {members.map(m => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f9fafb' }}>
                <span style={{ fontWeight: 500 }}>{m.first_name} {m.last_name}</span>
                <span style={{ color: '#6b7280', fontSize: 13 }}>{m.birth_date ? formatDate(m.birth_date) : ''}</span>
              </div>
            ))}
            {!family.first_name && members.length === 0 && <Empty />}
          </div>
        </div>
      )}

      {/* Memberships tab */}
      {tab === 'memberships' && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontWeight: 700 }}>היסטוריית מנויים</h3>
            <button onClick={addMembership} style={btnStyle('#16a34a', '#dcfce7')}>
              <Plus size={15} /> צור מנוי
            </button>
          </div>
          {memberships.length === 0 ? <Empty /> : memberships.map(m => {
            const sc2 = statusColor(m.active ? 'active' : 'inactive')
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f9fafb', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <div style={{ fontWeight: 600 }}>{membershipTypeLabel(m.type)}</div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>{formatDate(m.start_date)} — {m.end_date ? formatDate(m.end_date) : 'ללא הגבלה'}</div>
                </div>
                <PhonesEditor
                  phones={m.phones ?? []}
                  legacyPhone={m.phone}
                  familyPhone={family.phone}
                  onSave={(arr) => updateMembershipPhones(m.id, arr)}
                />
                <span style={{ ...sc2, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                  {m.active ? 'פעיל' : 'לא פעיל'}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Punch cards tab */}
      {tab === 'punch_cards' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {punchCards.map(pc => {
            const sc2 = statusColor(pc.status)
            return (
              <div key={pc.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>כרטיסייה</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ ...sc2, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{statusLabel(pc.status)}</span>
                    <button
                      onClick={() => deletePunchCard(pc.id, pc.used_entries)}
                      title="מחק כרטיסייה"
                      style={{
                        background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                        padding: '6px 8px', cursor: 'pointer', color: '#dc2626',
                        display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600,
                      }}>
                      <Trash2 size={14} /> מחק
                    </button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center' }}>
                  {[['נרכשו', pc.purchased_entries], ['שומשו', pc.used_entries], ['נותרו', pc.remaining_entries]].map(([l, v]) => (
                    <div key={String(l)} style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 8px' }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: '#1d4ed8' }}>{v}</div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{l}</div>
                    </div>
                  ))}
                </div>
                {pc.expiry_date && <div style={{ marginTop: 10, fontSize: 13, color: '#6b7280' }}>תוקף: {formatDate(pc.expiry_date)}</div>}
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, marginBottom: 6 }}>טלפונים משויכים:</div>
                  <PhonesEditor
                    phones={pc.phones ?? []}
                    legacyPhone={pc.phone}
                    familyPhone={family.phone}
                    onSave={(arr) => updatePunchCardPhones(pc.id, arr)}
                  />
                </div>

                {/* Retroactive entry */}
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f3f4f6' }}>
                  {retroFor === pc.id ? (
                    <div style={{ background: '#fefce8', border: '1.5px solid #fde047', borderRadius: 10, padding: 14 }}>
                      <div style={{ fontWeight: 700, color: '#854d0e', fontSize: 14, marginBottom: 10 }}>
                        ➕ הוסף כניסה רטרואקטיבית
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>תאריך</label>
                          <input type="date" value={retroDate} onChange={e => setRetroDate(e.target.value)}
                            style={{ padding: '8px 10px', border: '1.5px solid #fde047', borderRadius: 8, fontSize: 14, outline: 'none' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>שעה</label>
                          <input type="time" value={retroTime} onChange={e => setRetroTime(e.target.value)}
                            style={{ padding: '8px 10px', border: '1.5px solid #fde047', borderRadius: 8, fontSize: 14, outline: 'none' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>כניסות</label>
                          <input type="number" min={1} max={pc.remaining_entries} value={retroCount}
                            onChange={e => setRetroCount(+e.target.value)}
                            style={{ width: 80, padding: '8px 10px', border: '1.5px solid #fde047', borderRadius: 8, fontSize: 14, outline: 'none' }} />
                        </div>
                        <button onClick={() => addRetroactiveEntry(pc.id, pc.remaining_entries)}
                          style={btnStyle('#854d0e', '#fde047')}>
                          הוסף
                        </button>
                        <button onClick={() => { setRetroFor(null); setRetroCount(1) }}
                          style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: '#6b7280' }}>
                          ביטול
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => { setRetroFor(pc.id); setRetroDate(new Date().toISOString().slice(0, 10)); setRetroTime('12:00'); setRetroCount(1) }}
                      style={btnStyle('#854d0e', '#fef3c7')}>
                      <Plus size={14} /> הוסף כניסה רטרואקטיבית
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {/* Add punch card */}
          <div style={cardStyle}>
            <h4 style={{ fontWeight: 700, marginBottom: 12 }}>הוסף כרטיסייה חדשה</h4>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>מספר כניסות</label>
                <input type="number" min={1} value={addPunchEntries || ''} onChange={e => setAddPunchEntries(+e.target.value)}
                  style={{ width: 100, padding: '8px 10px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>תוקף (אופציונלי)</label>
                <input type="date" value={addPunchExpiry} onChange={e => setAddPunchExpiry(e.target.value)}
                  style={{ padding: '8px 10px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>טלפון משויך (אופציונלי)</label>
                <input type="tel" value={addPunchPhone} onChange={e => setAddPunchPhone(e.target.value)} placeholder="050-0000000"
                  style={{ padding: '8px 10px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, outline: 'none', direction: 'ltr', width: 140 }} />
              </div>
              <button onClick={addPunchCard} style={{ ...btnStyle('#16a34a', '#dcfce7'), alignSelf: 'flex-end' }}>
                <Plus size={15} /> הוסף
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Entries tab */}
      {tab === 'entries' && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontWeight: 700 }}>50 כניסות אחרונות</h3>
            <button onClick={load} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><RefreshCw size={16} /></button>
          </div>
          {entries.length === 0 ? <Empty /> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    {['תאריך', 'שעה', 'כניסות', 'סוג', 'סטטוס', 'ביטול'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#374151' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => {
                    const sc2 = statusColor(e.status)
                    return (
                      <tr key={e.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                        <td style={{ padding: '10px 12px' }}>{formatDate(e.entry_date)}</td>
                        <td style={{ padding: '10px 12px' }}>{formatTime(e.entry_time)}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{e.people_count}</td>
                        <td style={{ padding: '10px 12px' }}>{entryTypeLabel(e.entry_type)}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ ...sc2, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{statusLabel(e.status)}</span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {e.status === 'valid' && (
                            <button onClick={() => cancelEntry(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>
                              <XCircle size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showEditFamily && (
        <FamilyFormModal family={family} onClose={() => { setShowEditFamily(false); load() }} />
      )}
      {showQR && <FamilyQRCard family={family} onClose={() => setShowQR(false)} />}
    </div>
  )
}

function Empty() {
  return <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 14 }}>אין נתונים</div>
}

function PhonesEditor({ phones, legacyPhone, familyPhone, onSave }: {
  phones: string[]; legacyPhone: string | null; familyPhone: string; onSave: (arr: string[]) => void
}) {
  const [adding, setAdding] = useState(false)
  const [newPhone, setNewPhone] = useState('')
  const list = phones.length > 0 ? phones : (legacyPhone ? [legacyPhone] : [])

  function addPhone() {
    const p = newPhone.trim()
    if (!p) return
    if (list.includes(p)) { setNewPhone(''); setAdding(false); return }
    onSave([...list, p])
    setNewPhone('')
    setAdding(false)
  }
  function removePhone(idx: number) {
    onSave(list.filter((_, i) => i !== idx))
  }

  if (list.length === 0 && !adding) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          background: '#fef3c7', color: '#92400e', borderRadius: 8, padding: '6px 10px',
          fontSize: 12, fontWeight: 600,
        }}>
          📞 לא משויך → נופל ל-{familyPhone || '(טלפון משפחה ריק)'}
        </span>
        <button onClick={() => setAdding(true)} style={{
          background: '#dbeafe', color: '#1d4ed8', border: 'none', borderRadius: 8,
          padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>+ הוסף טלפון</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {list.map((p, i) => (
        <span key={i} style={{
          background: '#dbeafe', color: '#1d4ed8', borderRadius: 8, padding: '6px 8px 6px 10px',
          fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6,
          direction: 'ltr',
        }}>
          📞 {p}
          <button onClick={() => removePhone(i)} style={{
            background: 'rgba(29,78,216,0.15)', border: 'none', borderRadius: 4,
            width: 18, height: 18, cursor: 'pointer', color: '#1d4ed8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 13, lineHeight: 1,
          }} title="הסר">×</button>
        </span>
      ))}
      {adding ? (
        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          <input
            autoFocus
            type="tel"
            value={newPhone}
            onChange={e => setNewPhone(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addPhone(); if (e.key === 'Escape') { setAdding(false); setNewPhone('') } }}
            placeholder="050-0000000"
            style={{ padding: '5px 8px', border: '1.5px solid #1d4ed8', borderRadius: 6, fontSize: 13, outline: 'none', direction: 'ltr', width: 120 }}
          />
          <button onClick={addPhone} style={{ background: '#16a34a', color: 'white', border: 'none', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>שמור</button>
          <button onClick={() => { setAdding(false); setNewPhone('') }} style={{ background: '#f3f4f6', border: 'none', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', fontSize: 12, color: '#6b7280' }}>ביטול</button>
        </span>
      ) : (
        <button onClick={() => setAdding(true)} style={{
          background: '#f0fdf4', color: '#15803d', border: '1px dashed #86efac', borderRadius: 8,
          padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>+ הוסף</button>
      )}
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  background: 'white', borderRadius: 16, padding: '20px 24px',
  border: '1px solid #f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
}

function btnStyle(color: string, bg: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', background: bg, border: 'none',
    borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color,
  }
}
