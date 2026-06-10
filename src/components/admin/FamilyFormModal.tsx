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
    family_name: family?.family_name ?? '',
    phone: family?.phone ?? '',
    address: family?.address ?? '',
    membership_type: family?.membership_type ?? 'seasonal',
    start_date: family?.start_date ?? new Date().toISOString().slice(0, 10),
    end_date: family?.end_date ?? '',
    status: family?.status ?? 'active',
    notes: family?.notes ?? '',
  })
  const [loading, setLoading] = useState(false)

  function set(field: string, value: string) {
    setForm(p => ({ ...p, [field]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    const payload = {
      ...form,
      end_date: form.end_date || null,
      notes: form.notes || null,
    }

    let error
    if (isEdit) {
      const res = await supabase.from('families').update(payload).eq('id', family!.id)
      error = res.error
    } else {
      const familyNumber = await supabase.rpc('next_family_number')
      const res = await supabase.from('families').insert({ ...payload, family_number: familyNumber.data })
      error = res.error
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
          <Field label="שם משפחה *" value={form.family_name} onChange={v => set('family_name', v)} required />
          <Field label="טלפון" value={form.phone} onChange={v => set('phone', v)} type="tel" />
          <Field label="כתובת" value={form.address} onChange={v => set('address', v)} />

          <div>
            <label style={labelStyle}>סוג מנוי *</label>
            <select value={form.membership_type} onChange={e => set('membership_type', e.target.value)} style={selectStyle} required>
              <option value="seasonal">מנוי עונתי</option>
              <option value="annual">מנוי שנתי</option>
              <option value="punch_card">כרטיסייה</option>
            </select>
          </div>

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
