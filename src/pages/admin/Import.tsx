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
  grandchildren_count: number | null
  notes: string
}

interface RowResult {
  family_name: string
  status: 'ok' | 'error' | 'skip'
  message: string
}

function parseMembershipType(raw: string): string {
  if (!raw) return 'seasonal'
  if (raw.includes('כרטיסי') || raw.includes('כרטיסייה')) return 'punch_card'
  if (raw.includes('שנתי') || raw.includes('annual')) return 'annual'
  return 'seasonal'
}

function parsePunchCardEntries(raw: string): number {
  // e.g. "כרטיסייה 11 כניסות - ₪500" → 11
  const match = raw.match(/(\d+)\s*כניסות/)
  return match ? parseInt(match[1]) : 11
}

function seasonEndDate(): string {
  // Default: October 31 of current or next year
  const now = new Date()
  const year = now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear()
  return `${year}-10-31`
}

// 15.06.2026.xls format — positional, no Hebrew headers.
// Columns: 0=date, 1+2=amounts, 4=first_name, 5=last_name, 6=id, 7=phone, 8=email,
//          9=type, 14=spouse_name, 15=spouse_age, 16=spouse_phone,
//          17/20/23/26=child name (each +1 age, +2 phone), 30=notes
function parseHeaderlessFormat(data: any[][]): ParsedFamily[] {
  const parsed: ParsedFamily[] = []
  for (let i = 0; i < data.length; i++) {
    const r = data[i] ?? []
    const firstName = String(r[4] ?? '').trim()
    const lastName = String(r[5] ?? '').trim()
    if (!firstName && !lastName) continue
    // sanity: row must have a numeric-looking amount in col 1
    const col1 = String(r[1] ?? '').trim()
    if (!col1 || !/^\d+(\.\d+)?$/.test(col1)) continue

    const children: { name: string; age: string; phone: string }[] = []
    for (let c = 0; c < 4; c++) {
      const base = 17 + c * 3
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
      id_number: String(r[6] ?? '').trim(),
      phone: String(r[7] ?? '').trim(),
      email: String(r[8] ?? '').trim(),
      membership_type_raw: String(r[9] ?? '').trim(),
      spouse_name: String(r[14] ?? '').trim(),
      spouse_age: String(r[15] ?? '').trim(),
      spouse_phone: String(r[16] ?? '').trim(),
      children,
      grandchildren_count: (() => {
        const raw = String(r[29] ?? '').trim()
        const n = parseInt(raw)
        return Number.isFinite(n) && n > 0 ? n : null
      })(),
      notes: String(r[30] ?? '').trim(),
    })
  }
  return parsed
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

    // Find header row dynamically (look for row containing שם מנוי ראשי)
    let headerRowIdx = -1
    let colMap: Record<string, number> = {}
    for (let i = 0; i < Math.min(5, data.length); i++) {
      const row = data[i]
      const rowStr = row.map((c: any) => String(c ?? '')).join('|')
      if (rowStr.includes('שם מנוי ראשי') || rowStr.includes('נייד מנוי ראשי')) {
        headerRowIdx = i
        row.forEach((cell: any, idx: number) => {
          const key = String(cell ?? '').trim()
          if (key) colMap[key] = idx
        })
        break
      }
    }
    // No Hebrew header row found — fall back to positional layout (15.06.2026.xls style)
    if (headerRowIdx === -1) {
      const parsed = parseHeaderlessFormat(data)
      if (parsed.length === 0) {
        toast.error('לא נמצאה שורת כותרות וגם לא זוהה פורמט חלופי')
        return
      }
      setRows(parsed)
      setResults([])
      setStep('preview')
      toast.success(`זוהו ${parsed.length} רשומות (פורמט ללא כותרות)`)
      return
    }

    // Helper to get col index by partial header name (normalize Hebrew text)
    const normalize = (s: string) => s.replace(/[^א-ת -~]/g, '').replace(/\s+/g, ' ').trim()
    const col = (partial: string): number => {
      const normPartial = normalize(partial)
      const found = Object.keys(colMap).find(k => normalize(k).includes(normPartial))
      return found !== undefined ? colMap[found] : -1
    }

    const iFirstName = col('שם מנוי ראשי')
    const iLastName = col('משפחה')
    const iId = col('ת.ז')
    const iPhone = col('נייד מנוי ראשי')
    const iEmail = col('דוא') // matches דוא"ל regardless of quote character
    const iType = col('סוג מנוי')
    const iSpouseName = col('שם בן')
    const iSpousePhone = col('נייד מנוי משני')
    const iNotes = col('הערות')
    const iGrandchildren = col('נכדים')

    // Children: find columns "שם מנוי ילד 1", "שם מנוי ילד 2" etc.
    const childCols: { nameIdx: number; phoneIdx: number }[] = []
    for (let c = 1; c <= 4; c++) {
      const nameIdx = col(`ילד ${c}`)
      // phone comes 2 columns after name (name, גיל, נייד)
      if (nameIdx >= 0) childCols.push({ nameIdx, phoneIdx: nameIdx + 2 })
    }

    const parsed: ParsedFamily[] = []
    for (let i = headerRowIdx + 1; i < data.length; i++) {
      const r = data[i]
      const firstName = String(r[iFirstName] ?? '').trim()
      const lastName = String(r[iLastName] ?? '').trim()
      if (!firstName && !lastName) continue

      const children: { name: string; age: string; phone: string }[] = []
      for (const { nameIdx, phoneIdx } of childCols) {
        const name = String(r[nameIdx] ?? '').trim()
        if (name) {
          children.push({
            name,
            age: String(r[nameIdx + 1] ?? '').trim(),
            phone: String(r[phoneIdx] ?? '').trim(),
          })
        }
      }

      parsed.push({
        months: '',
        first_name: firstName,
        last_name: lastName,
        id_number: iId >= 0 ? String(r[iId] ?? '').trim() : '',
        phone: iPhone >= 0 ? String(r[iPhone] ?? '').trim() : '',
        email: iEmail >= 0 ? String(r[iEmail] ?? '').trim() : '',
        membership_type_raw: iType >= 0 ? String(r[iType] ?? '').trim() : '',
        spouse_name: iSpouseName >= 0 ? String(r[iSpouseName] ?? '').trim() : '',
        spouse_age: '',
        spouse_phone: iSpousePhone >= 0 ? String(r[iSpousePhone] ?? '').trim() : '',
        children,
        grandchildren_count: (() => {
          if (iGrandchildren < 0) return null
          const raw = String(r[iGrandchildren] ?? '').trim()
          const n = parseInt(raw)
          return Number.isFinite(n) && n > 0 ? n : null
        })(),
        notes: iNotes >= 0 ? String(r[iNotes] ?? '').trim() : '',
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
      const endDate = seasonEndDate()
      const membershipType = parseMembershipType(row.membership_type_raw)
      const punchEntries = parsePunchCardEntries(row.membership_type_raw)

      // collect all phones from the row (primary + spouse + children)
      const allPhones = [row.phone, row.spouse_phone, ...row.children.map(c => c.phone)]
        .map(p => (p ?? '').trim())
        .filter(p => p.length >= 9)
      const uniquePhones = Array.from(new Set(allPhones))

      try {
        // Dedupe by first_name + last_name (not by phone).
        // Two people sharing a phone (e.g. רותי דר punch_card, מילי דר membership) are different families.
        let existing = null
        if (familyName && row.first_name) {
          const { data } = await supabase
            .from('families')
            .select('id, first_name, family_name')
            .eq('family_name', familyName)
            .eq('first_name', row.first_name)
            .maybeSingle()
          existing = data
        }

        if (existing) {
          // family exists — sync phones onto its active membership/punch_card
          if (membershipType === 'punch_card') {
            // find existing punch card or insert new one
            const { data: pc } = await supabase
              .from('punch_cards')
              .select('id, phones')
              .eq('family_id', existing.id)
              .eq('status', 'active')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
            if (pc) {
              const merged = Array.from(new Set([...(pc.phones ?? []), ...uniquePhones]))
              await supabase.from('punch_cards').update({ phones: merged }).eq('id', pc.id)
              res.push({ family_name: `${row.first_name} ${familyName}`, status: 'ok', message: `סונכרנו ${uniquePhones.length} טלפונים לכרטיסייה קיימת` })
            } else {
              await supabase.from('punch_cards').insert({
                family_id: existing.id,
                purchased_entries: punchEntries,
                used_entries: 0,
                expiry_date: endDate,
                status: 'active',
                phones: uniquePhones,
                owner_name: `${row.first_name} ${row.last_name}`.trim() || null,
              })
              res.push({ family_name: `${row.first_name} ${familyName}`, status: 'ok', message: 'כרטיסיה (11 כניסות) נוספה למשפחה קיימת' })
            }
          } else {
            // sync phones onto active membership — or add a new membership if none exists
            const { data: ms } = await supabase
              .from('memberships')
              .select('id, phones')
              .eq('family_id', existing.id)
              .eq('active', true)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
            if (ms) {
              const merged = Array.from(new Set([...(ms.phones ?? []), ...uniquePhones]))
              await supabase.from('memberships').update({ phones: merged }).eq('id', ms.id)
              res.push({ family_name: `${row.first_name} ${familyName}`, status: 'ok', message: `סונכרנו ${uniquePhones.length} טלפונים למנוי קיים` })
            } else {
              // person already has e.g. a punch_card — add the new membership alongside it
              await supabase.from('memberships').insert({
                family_id: existing.id,
                type: membershipType,
                start_date: new Date().toISOString().slice(0, 10),
                end_date: endDate,
                active: true,
                phones: uniquePhones,
                grandchildren_count: row.grandchildren_count ?? null,
              })
              res.push({ family_name: `${row.first_name} ${familyName}`, status: 'ok', message: 'מנוי נוסף למשפחה קיימת' })
            }
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
            email: row.email || null,
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

        // Create membership or punch card with all collected phones
        if (membershipType === 'punch_card') {
          await supabase.from('punch_cards').insert({
            family_id: familyId,
            purchased_entries: punchEntries,
            used_entries: 0,
            expiry_date: endDate,
            status: 'active',
            phones: uniquePhones,
            owner_name: `${row.first_name} ${row.last_name}`.trim() || null,
          })
        } else if (endDate) {
          await supabase.from('memberships').insert({
            family_id: familyId,
            type: membershipType,
            type_label: row.membership_type_raw || null,
            start_date: new Date().toISOString().slice(0, 10),
            end_date: endDate,
            active: true,
            phones: uniquePhones,
            grandchildren_count: row.grandchildren_count ?? null,
          })
        }

        // Members
        const members: { family_id: string; first_name: string; last_name: string; birth_date: null }[] = []
        const lastName = row.last_name || familyName

        // Split a full name into first/last — avoiding "תום אטיאס אטיאס" when full name is given
        function splitName(fullName: string): { first: string; last: string } {
          const clean = (fullName ?? '').trim()
          if (!clean) return { first: '', last: lastName }
          // Already ends with family's last_name? strip it
          if (lastName && clean.endsWith(' ' + lastName)) {
            return { first: clean.slice(0, -lastName.length - 1).trim(), last: lastName }
          }
          // Multi-word name: split, last word becomes last_name
          const parts = clean.split(/\s+/)
          if (parts.length > 1) return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] }
          // Single word — use family's last_name
          return { first: clean, last: lastName }
        }

        // Primary member
        if (row.first_name) {
          members.push({ family_id: familyId, first_name: row.first_name, last_name: lastName, birth_date: null })
        }
        // Spouse
        if (row.spouse_name) {
          const s = splitName(row.spouse_name)
          if (s.first) members.push({ family_id: familyId, first_name: s.first, last_name: s.last, birth_date: null })
        }
        // Children
        for (const child of row.children) {
          const c = splitName(child.name)
          if (c.first) members.push({ family_id: familyId, first_name: c.first, last_name: c.last, birth_date: null })
        }

        if (members.length > 0) {
          // Insert members one by one, skip if same first_name already exists for this family
          for (const m of members) {
            const { data: existing } = await supabase
              .from('family_members')
              .select('id')
              .eq('family_id', m.family_id)
              .eq('first_name', m.first_name)
              .maybeSingle()
            if (!existing) {
              await supabase.from('family_members').insert(m)
            }
          }
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
          {['שם פרטי', 'משפחה', 'ת.ז', 'נייד ראשי', 'דוא"ל', 'סוג מנוי', 'שם בן/ת זוג', 'נייד משני', 'ילד 1-4 + נייד', 'הערות'].map(c => (
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
                    {['שם פרטי', 'שם משפחה', 'טלפון', 'מייל', 'סוג מנוי', 'תוקף', 'בן/ת זוג', 'ילדים'].map(h => (
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
                      <td style={{ padding: '9px 14px', color: '#6b7280', fontSize: 11 }}>{r.email}</td>
                      <td style={{ padding: '9px 14px' }}>
                        <span style={{ background: '#f3f4f6', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
                          {r.membership_type_raw}
                        </span>
                      </td>
                      <td style={{ padding: '9px 14px', color: '#6b7280', fontSize: 12 }}>{seasonEndDate()}</td>
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
