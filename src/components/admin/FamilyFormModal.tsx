import { useState, FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  onClose: () => void
  family?: {
    id: string
    family_name: string
    first_name?: string | null
    phone: string
    address: string | null
    membership_type: string
    start_date: string | null
    end_date: string | null
    status: string
    notes: string | null
  }
}

export default function FamilyFormModal({ onClose, family }: Props) {
  const isEdit = !!family
  const [form, setForm] = useState({
    first_name: family?.first_name ?? '',
    family_name: family?.family_name ?? '',
    phone: family?.phone ?? '',
    address: family?.address ?? '',
    membership_type: family?.membership_type ?? 'seasonal',
    membership_label: '',
    start_date: family?.start_date ?? new Date().toISOString().slice(0, 10),
    end_date: family?.end_date ?? '2026-10-31',
    status: family?.status ?? 'active',
    notes: family?.notes ?? '',
    punch_entries: '11',
  })
  const [loading, setLoading] = useState(false)
  const [members, setMembers] = useState<{ first_name: string; last_name: string }[]>([])

  function set(field: string, value: string) {
    setForm(p => ({ ...p, [field]: value }))
  }

  function addMember() {
    setMembers(p => [...p, { first_name: '', last_name: form.family_name }])
  }

  function updateMember(i: number, field: string, value: string) {
    setMembers(p => p.map((m, idx) => idx === i ? { ...m, [field]: value } : m))
  }

  function removeMember(i: number) {
    setMembers(p => p.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    const payload = {
      first_name: form.first_name || null,
      family_name: form.family_name,
      phone: form.phone || null,
      address: form.address || null,
      membership_type: form.membership_type,
      start_date: form.start_date,
      end_date: form.end_date || null,
      status: form.status,
      notes: form.notes || null,
    }

    let error
    if (isEdit) {
      const res = await supabase.from('families').update(payload).eq('id', family!.id)
      error = res.error
    } else {
      const familyNumber = await supabase.rpc('next_family_number')
      const { data: newFamily, error: insertError } = await supabase
        .from('families').insert({ ...payload, family_number: familyNumber.data }).select().single()
      error = insertError
      if (!error && newFamily) {
        // Add family members
        const validMembers = members.filter(m => m.first_name.trim())
        if (validMembers.length > 0) {
          await supabase.from('family_members').insert(
            validMembers.map(m => ({ family_id: newFamily.id, first_name: m.first_name.trim(), last_name: m.last_name.trim() || form.family_name }))
          )
        }
        // Add membership or punch card
        if (form.membership_type === 'punch_card') {
          const entries = parseInt(form.punch_entries) || 11
          await supabase.from('punch_cards').insert({
            family_id: newFamily.id,
            purchased_entries: entries,
            used_entries: 0,
            status: 'active',
            expiry_date: form.end_date || null,
          })
        } else {
          const labelMap: Record<string, string> = {
            seasonal: form.membership_label || 'מנוי עונתי',
            annual: form.membership_label || 'מנוי שנתי',
          }
          await supabase.from('memberships').insert({
            family_id: newFamily.id,
            type: form.membership_type,
            type_label: labelMap[form.membership_type] || form.membership_label || form.membership_type,
            start_date: form.start_date,
            end_date: form.end_date || null,
            active: true,
          })
        }
      }
    }

    setLoading(false)
    if (error) {
      toast.error('שגיאה בשמירה: ' + error.message)
    } else {
      toast.success(isEdit ? 'המשפחה עודכנה' : 'המשפחה נוספה')
      onClose()
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 20, direction: 'rtl',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'white', borderRadius: 20, width: '100%', maxWidth: 560,
        maxHeight: '90vh', overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        animation: 'scaleIn 0.2s ease',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{isEdit ? 'עריכת משפחה' : 'הוספת משפחה'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="שם פרטי" value={form.first_name} onChange={v => set('first_name', v)} />
            <Field label="שם משפחה *" value={form.family_name} onChange={v => set('family_name', v)} required />
          </div>
          <Field label="טלפון" value={form.phone} onChange={v => set('phone', v)} type="tel" />
          <Field label="כתובת" value={form.address} onChange={v => set('address', v)} />

          <div>
            <label style={labelStyle}>סוג מנוי *</label>
            <select
              value={form.membership_label || form.membership_type}
              onChange={e => {
                const v = e.target.value
                if (v === 'punch_card_11') { set('membership_type', 'punch_card'); set('membership_label', 'כרטיסייה 11 כניסות'); set('punch_entries', '11') }
                else if (v === 'punch_card') { set('membership_type', 'punch_card'); set('membership_label', 'כרטיסייה') }
                else if (v === 'individual') { set('membership_type', 'seasonal'); set('membership_label', 'מנוי יחיד - 500 ₪') }
                else if (v === 'couple') { set('membership_type', 'seasonal'); set('membership_label', 'מנוי זוגי - 1000 ₪') }
                else if (v === 'family') { set('membership_type', 'seasonal'); set('membership_label', 'מנוי משפחתי - 1000 ₪') }
                else if (v === 'pensioner') { set('membership_type', 'seasonal'); set('membership_label', 'מנוי פנסיונר') }
                else if (v === 'annual') { set('membership_type', 'annual'); set('membership_label', 'מנוי שנתי') }
              }}
              style={selectStyle} required>
              <option value="individual">מנוי יחיד - 500 ₪</option>
              <option value="couple">מנוי זוגי - 1000 ₪</option>
              <option value="family">מנוי משפחתי - 1000 ₪</option>
              <option value="pensioner">מנוי פנסיונר</option>
              <option value="annual">מנוי שנתי</option>
              <option value="punch_card_11">כרטיסייה 11 כניסות</option>
              <option value="punch_card">כרטיסייה (אחר)</option>
            </select>
          </div>

          {form.membership_type === 'punch_card' && (
            <Field label="מספר כניסות" value={form.punch_entries} onChange={v => set('punch_entries', v)} type="number" />
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="תאריך התחלה *" value={form.start_date} onChange={v => set('start_date', v)} type="date" required />
            <Field label="תאריך סיום" value={form.end_date} onChange={v => set('end_date', v)} type="date" />
          </div>

          {isEdit && (
            <div>
              <label style={labelStyle}>סטטוס</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} style={selectStyle}>
                <option value="active">פעיל</option>
                <option value="inactive">לא פעיל</option>
                <option value="suspended">מושהה</option>
              </select>
            </div>
          )}

          <div>
            <label style={labelStyle}>הערות</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          {!isEdit && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <label style={labelStyle}>חברי משפחה</label>
                <button type="button" onClick={addMember} style={{
                  background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8,
                  padding: '4px 12px', fontSize: 13, color: '#1d4ed8', cursor: 'pointer', fontWeight: 600,
                }}>+ הוסף חבר</button>
              </div>
              {members.map((m, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <input
                    placeholder="שם פרטי"
                    value={m.first_name}
                    onChange={e => updateMember(i, 'first_name', e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <input
                    placeholder="שם משפחה"
                    value={m.last_name}
                    onChange={e => updateMember(i, 'last_name', e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button type="button" onClick={() => removeMember(i)} style={{
                    background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                    padding: '8px 10px', color: '#dc2626', cursor: 'pointer', fontSize: 16, fontWeight: 700,
                  }}>×</button>
                </div>
              ))}
              {members.length === 0 && (
                <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>לחץ "+ הוסף חבר" להוספת בן/בת זוג או ילדים</p>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{
              padding: '10px 20px', background: '#f3f4f6', border: 'none', borderRadius: 10,
              fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#374151',
            }}>ביטול</button>
            <button type="submit" disabled={loading} style={{
              padding: '10px 24px', background: 'linear-gradient(135deg, #1d4ed8, #0ea5e9)',
              border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer', color: 'white',
            }}>{loading ? 'שומר...' : 'שמור'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit' }
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer', background: 'white' }

function Field({ label, value, onChange, type = 'text', required }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} required={required} style={inputStyle} />
    </div>
  )
}
