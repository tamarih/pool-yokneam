import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Upload, CheckCircle, XCircle, AlertCircle, FileSpreadsheet } from 'lucide-react'
import toast from 'react-hot-toast'

interface ParsedFamily {
  months: string
  first_name: string
  last_name: string
  id_number: string
  phone: string
  email: string
  membership_type_raw: string
  spouse_name: string
  spouse_age: string
  spouse_phone: string
  children: { name: string; age: string; phone: string }[]
  notes: string
}

interface RowResult {
  family_name: string
  status: 'ok' | 'error' | 'skip'
  message: string
}

function parseMembershipType(raw: string): string {
  if (!raw) return 'seasonal'
  const r = raw
  if (r.includes('כרטיסי')) return 'punch_card'
  if (r.includes('שנתי') || r.includes('annual')) return 'annual'
  return 'seasonal'
}

function parseEndDate(monthsStr: string): string | null {
  if (!monthsStr) return null
  // "יוני 26- אוקטובר 26" → take last month
  const months: Record<string, string> = {
    'ינואר': '01', 'פברואר': '02', 'מרץ': '03', 'אפריל': '04',
    'מאי': '05', 'יוני': '06', 'יולי': '07', 'אוגוסט': '08',
    'ספטמבר': '09', 'אוקטובר': '10', 'נובמבר': '11', 'דצמבר': '12',
  }
  // find last month-year pair
  const parts = monthsStr.split('-')
  const last = parts[parts.length - 1].trim()
  for (const [heb, num] of Object.entries(months)) {
    if (last.includes(heb)) {
      const yearMatch = last.match(/\d{2,4}/)
      if (yearMatch) {
        const yr = yearMatch[0].length === 2 ? '20' + yearMatch[0] : yearMatch[0]
        // last day of that month
        const lastDay = new Date(+yr, +num, 0).getDate()
        return `${yr}-${num}-${String(lastDay).padStart(2, '0')}`
      }
    }
  }
  return null
}

export default function AdminImport() {
  const [rows, setRows] = useState<ParsedFamily[]>([])
  const [results, setResults] = useState<RowResult[]>([])
  const [importing, setImporting] = useState(false)
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload')
  const [residentType, setResidentType] = useState<'local' | 'external'>('local')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    const { read, utils } = await import('xlsx')
    const buf = await file.arrayBuffer()
    const wb = read(buf)
    const ws = wb.Sheets[wb.SheetNames[0]]
    const data = utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' })

    // Skip header row (row 0)
    const parsed: ParsedFamily[] = []
    for (let i = 1; i < data.length; i++) {
      const r = data[i]
      const firstName = String(r[1] ?? '').trim()
      const lastName = String(r[2] ?? '').trim()
      if (!firstName && !lastName) continue

      const children: { name: string; age: string; phone: string }[] = []
      // Children at columns 10-21 (3 cols each: name, age, phone × 4 children)
      for (let c = 0; c < 4; c++) {
        const base = 10 + c * 3
        const name = String(r[base] ?? '').trim()
        if (name) {
          children.push({
            name,
            age: String(r[base + 1] ?? '').trim(),
            phone: String(r[base + 2] ?? '').trim(),
          })
        }
      }

      parsed.push({
        months: String(r[0] ?? '').trim(),
        first_name: firstName,
        last_name: lastName,
        id_number: String(r[3] ?? '').trim(),
        phone: String(r[4] ?? '').trim(),
        email: String(r[5] ?? '').trim(),
        membership_type_raw: String(r[6] ?? '').trim(),
        spouse_name: String(r[7] ?? '').trim(),
        spouse_age: String(r[8] ?? '').trim(),
        spouse_phone: String(r[9] ?? '').trim(),
        children,
        notes: String(r[23] ?? '').trim(),
      })
    }

    setRows(parsed)
    setResults([])
    setStep('preview')
  }

  async function runImport() {
    setImporting(true)
    const res: RowResult[] = []

    for (const row of rows) {
      const familyName = row.last_name || row.first_name
      const endDate = parseEndDate(row.months)
      const membershipType = parseMembershipType(row.membership_type_raw)

      try {
        // Check duplicate by phone (primary) or name if no phone
        const phone = row.phone || null
        let existing = null
        if (phone) {
          const { data } = await supabase
            .from('families')
            .select('id')
            .eq('phone', phone)
            .maybeSingle()
          existing = data
        } else {
          const { data } = await supabase
            .from('families')
            .select('id')
            .eq('family_name', familyName)
            .maybeSingle()
          existing = data
        }

        if (existing) {
          // If punch_card — add punch card to existing family
          if (membershipType === 'punch_card') {
            await supabase.from('punch_cards').insert({
              family_id: existing.id,
              purchased_entries: 11,
              used_entries: 0,
              expiry_date: endDate,
              status: 'active',
            })
            res.push({ family_name: `${row.first_name} ${familyName}`, status: 'ok', message: 'כרטיסיה (11 כניסות) נוספה למשפחה קיימת' })
          } else {
            res.push({ family_name: `${row.first_name} ${familyName}`, status: 'skip', message: 'קיים — דולג' })
          }
          continue
        }

        // Insert family
        const { data: fam, error: famErr } = await supabase
          .from('families')
          .insert({
            family_name: familyName,
            first_name: row.first_name || null,
            phone: row.phone || null,
            address: null,
            membership_type: membershipType === 'punch_card' ? 'seasonal' : membershipType,
            end_date: endDate,
            status: 'active',
            notes: row.notes || null,
            resident_type: residentType,
          })
          .select('id')
          .single()

        if (famErr) throw new Error(famErr.message)
        const familyId = fam.id

        // Create membership or punch card
        if (membershipType === 'punch_card') {
          await supabase.from('punch_cards').insert({
            family_id: familyId,
            purchased_entries: 11,
            used_entries: 0,
            expiry_date: endDate,
            status: 'active',
          })
        } else if (endDate) {
          await supabase.from('memberships').insert({
            family_id: familyId,
            type: membershipType,
            start_date: new Date().toISOString().slice(0, 10),
            end_date: endDate,
            active: true,
          })
        }

        // Members
        const members: { family_id: string; first_name: string; last_name: string; birth_date: null }[] = []

        const lastName = row.last_name || familyName
        // Primary member
        if (row.first_name) {
          members.push({ family_id: familyId, first_name: row.first_name, last_name: lastName, birth_date: null })
        }
        // Spouse
        if (row.spouse_name) {
          members.push({ family_id: familyId, first_name: row.spouse_name, last_name: lastName, birth_date: null })
        }
        // Children
        for (const child of row.children) {
          members.push({ family_id: familyId, first_name: child.name, last_name: lastName, birth_date: null })
        }

        if (members.length > 0) {
          await supabase.from('family_members').insert(members)
        }

        res.push({ family_name: `${row.first_name} ${familyName}`, status: 'ok', message: `נוסף (${members.length} חברים, ${membershipType})` })
      } catch (e: any) {
        res.push({ family_name: `${row.first_name} ${familyName}`, status: 'error', message: e.message })
      }
    }

    setResults(res)
    setStep('done')
    setImporting(false)
    const ok = res.filter(r => r.status === 'ok').length
    const skip = res.filter(r => r.status === 'skip').length
    const err = res.filter(r => r.status === 'error').length
    toast.success(`ייבוא הסתיים: ${ok} נוספו, ${skip} קיימים, ${err} שגיאות`)
  }

  const okCount = results.filter(r => r.status === 'ok').length
  const errCount = results.filter(r => r.status === 'error').length
  const skipCount = results.filter(r => r.status === 'skip').length

  return (
    <div style={{ padding: '28px', direction: 'rtl', maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827' }}>ייבוא מנויים מאקסל</h1>
        <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>
          תומך בפורמט טבלת תושבי יקנעם — שורה אחת למנוי כולל בן/ת זוג וילדים
        </p>
      </div>

      {/* Resident type selector */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: '#374151' }}>סוג תושב:</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
          <input type="radio" name="residentType" value="local" checked={residentType === 'local'} onChange={() => setResidentType('local')} />
          תושב מושבה יקנעם
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
          <input type="radio" name="residentType" value="external" checked={residentType === 'external'} onChange={() => setResidentType('external')} />
          תושב חוץ
        </label>
      </div>

      {/* Format info */}
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: '#1e40af', fontWeight: 600, marginBottom: 8 }}>עמודות נתמכות בקובץ:</div>
        <div style={{ fontSize: 12, color: '#1d4ed8', display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
          {['חודשי מנוי', 'שם פרטי', 'שם משפחה', 'ת.ז', 'נייד מנוי ראשי', 'דוא"ל', 'סוג מנוי', 'שם בן/ת זוג', 'גיל', 'נייד משני', 'שמות ילדים 1-4', 'הערות'].map(c => (
            <span key={c} style={{ background: '#dbeafe', padding: '2px 8px', borderRadius: 4 }}>{c}</span>
          ))}
        </div>
      </div>

      {/* Upload area */}
      {step === 'upload' && (
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            border: '2.5px dashed #d1d5db', borderRadius: 16, padding: '60px 40px',
            textAlign: 'center', cursor: 'pointer', background: '#fafafa',
          }}
          onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = '#2563eb' }}
          onDragLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#d1d5db' }}
          onDrop={e => {
            e.preventDefault()
            ;(e.currentTarget as HTMLElement).style.borderColor = '#d1d5db'
            const file = e.dataTransfer.files[0]
            if (file) handleFile(file)
          }}
        >
          <FileSpreadsheet size={48} color="#9ca3af" style={{ marginBottom: 16 }} />
          <p style={{ fontSize: 16, fontWeight: 600, color: '#374151', marginBottom: 6 }}>גרור קובץ Excel לכאן</p>
          <p style={{ fontSize: 13, color: '#9ca3af' }}>או לחץ לבחירת קובץ (.xlsx, .xls)</p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
        </div>
      )}

      {/* Preview */}
      {step === 'preview' && rows.length > 0 && (
        <div>
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #f3f4f6', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: '#111827' }}>תצוגה מקדימה — {rows.length} רשומות</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setStep('upload'); setRows([]) }} style={ghostBtn}>החלף קובץ</button>
                <button onClick={runImport} disabled={importing} style={primaryBtn}>
                  <Upload size={15} />
                  {importing ? 'מייבא...' : `ייבא ${rows.length} רשומות`}
                </button>
              </div>
            </div>
            <div style={{ overflowX: 'auto', maxHeight: 420 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    {['שם פרטי', 'שם משפחה', 'טלפון', 'סוג מנוי', 'תוקף', 'בן/ת זוג', 'ילדים'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: '#374151', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f9fafb' }}>
                      <td style={{ padding: '9px 14px', fontWeight: 600 }}>{r.first_name}</td>
                      <td style={{ padding: '9px 14px' }}>{r.last_name}</td>
                      <td style={{ padding: '9px 14px', color: '#6b7280' }}>{r.phone}</td>
                      <td style={{ padding: '9px 14px' }}>
                        <span style={{ background: '#f3f4f6', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
                          {r.membership_type_raw}
                        </span>
                      </td>
                      <td style={{ padding: '9px 14px', color: '#6b7280', fontSize: 12 }}>{parseEndDate(r.months) ?? r.months}</td>
                      <td style={{ padding: '9px 14px', color: '#6b7280' }}>{r.spouse_name}</td>
                      <td style={{ padding: '9px 14px', color: '#6b7280' }}>{r.children.map(c => c.name).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {step === 'done' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            <StatCard value={okCount} label="נוספו בהצלחה" color="#16a34a" bg="#dcfce7" border="#86efac" />
            <StatCard value={skipCount} label="קיימים (דולגו)" color="#ca8a04" bg="#fef9c3" border="#fde047" />
            <StatCard value={errCount} label="שגיאות" color={errCount > 0 ? '#dc2626' : '#9ca3af'} bg={errCount > 0 ? '#fee2e2' : '#f9fafb'} border={errCount > 0 ? '#fca5a5' : '#f3f4f6'} />
          </div>

          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #f3f4f6', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700 }}>פירוט תוצאות</span>
              <button onClick={() => { setStep('upload'); setRows([]); setResults([]) }} style={ghostBtn}>ייבוא חדש</button>
            </div>
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {results.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '1px solid #f9fafb' }}>
                  {r.status === 'ok' && <CheckCircle size={16} color="#16a34a" />}
                  {r.status === 'error' && <XCircle size={16} color="#dc2626" />}
                  {r.status === 'skip' && <AlertCircle size={16} color="#ca8a04" />}
                  <span style={{ fontWeight: 600, minWidth: 140 }}>{r.family_name}</span>
                  <span style={{ fontSize: 13, color: r.status === 'error' ? '#dc2626' : '#6b7280' }}>{r.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ value, label, color, bg, border }: { value: number; label: string; color: string; bg: string; border: string }) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: 16, textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 13, color, marginTop: 4, opacity: 0.8 }}>{label}</div>
    </div>
  )
}

const primaryBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '9px 18px', background: 'linear-gradient(135deg, #1d4ed8, #0ea5e9)',
  border: 'none', borderRadius: 8, color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}

const ghostBtn: React.CSSProperties = {
  padding: '8px 14px', background: '#f3f4f6', border: 'none',
  borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', color: '#374151',
}
