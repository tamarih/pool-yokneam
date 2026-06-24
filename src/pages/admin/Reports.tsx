import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDate, entryTypeLabel } from '@/utils/format'
import { Download, FileText, BarChart3 } from 'lucide-react'
import toast from 'react-hot-toast'

interface ReportRow {
  entry_date: string
  family_name: string
  family_number: string
  people_count: number
  entry_type: string
}

function entryFamilyName(entry: {
  family_name_snapshot?: string | null
  family?: { first_name?: string | null; family_name?: string | null } | null
}): string {
  const liveName = [entry.family?.first_name, entry.family?.family_name].filter(Boolean).join(' ').trim()
  return liveName || entry.family_name_snapshot || 'משפחה שנמחקה'
}

export default function AdminReports() {
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(false)
  const [reportType, setReportType] = useState<'daily' | 'monthly' | 'range'>('daily')
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 10))
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10))
  const [monthYear, setMonthYear] = useState(new Date().toISOString().slice(0, 7))

  async function loadReport() {
    setLoading(true)
    let from = dateFrom, to = dateTo
    if (reportType === 'daily') { from = dateFrom; to = dateFrom }
    else if (reportType === 'monthly') {
      const [y, m] = monthYear.split('-')
      from = `${y}-${m}-01`
      const lastDay = new Date(+y, +m, 0).getDate()
      to = `${y}-${m}-${String(lastDay).padStart(2, '0')}`
    }

    const { data } = await supabase
      .from('entries')
      .select('entry_date, entry_type, people_count, family_name_snapshot, family:families(first_name, family_name, family_number)')
      .gte('entry_date', from)
      .lte('entry_date', to)
      .eq('status', 'valid')
      .order('entry_date', { ascending: false })

    setRows((data ?? []).map((r: any) => ({
      entry_date: r.entry_date,
      family_name: entryFamilyName(r),
      family_number: r.family?.family_number ?? '',
      people_count: r.people_count,
      entry_type: r.entry_type,
    })))
    setLoading(false)
  }

  function exportCSV() {
    if (rows.length === 0) return toast.error('אין נתונים לייצוא')
    const headers = ['תאריך', 'משפחה', 'מספר', 'כניסות', 'סוג']
    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return /["\n,]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const csv = [
      headers.join(','),
      ...rows.map(r => [formatDate(r.entry_date), r.family_name, r.family_number, r.people_count, entryTypeLabel(r.entry_type)].map(escape).join(','))
    ].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'דוח_כניסות.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  async function exportExcel() {
    if (rows.length === 0) return toast.error('אין נתונים לייצוא')
    const { utils, writeFile } = await import('xlsx')
    const ws = utils.json_to_sheet(rows.map(r => ({
      תאריך: formatDate(r.entry_date),
      משפחה: r.family_name,
      'מס׳ משפחה': r.family_number,
      'מספר כניסות': r.people_count,
      'סוג כניסה': entryTypeLabel(r.entry_type),
    })))
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'כניסות')
    writeFile(wb, 'דוח_כניסות.xlsx')
  }

  const totalPeople = rows.reduce((s, r) => s + r.people_count, 0)
  const byType = rows.reduce((acc, r) => { acc[r.entry_type] = (acc[r.entry_type] ?? 0) + r.people_count; return acc }, {} as Record<string, number>)

  return (
    <div style={{ padding: '28px', direction: 'rtl' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827' }}>דוחות</h1>
      </div>

      {/* Controls */}
      <div style={{ background: 'white', borderRadius: 16, padding: '20px 24px', marginBottom: 20, border: '1px solid #f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={lbl}>סוג דוח</label>
            <select value={reportType} onChange={e => setReportType(e.target.value as any)} style={sel}>
              <option value="daily">יומי</option>
              <option value="monthly">חודשי</option>
              <option value="range">טווח תאריכים</option>
            </select>
          </div>

          {reportType === 'daily' && (
            <div>
              <label style={lbl}>תאריך</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inp} />
            </div>
          )}
          {reportType === 'monthly' && (
            <div>
              <label style={lbl}>חודש</label>
              <input type="month" value={monthYear} onChange={e => setMonthYear(e.target.value)} style={inp} />
            </div>
          )}
          {reportType === 'range' && (
            <>
              <div>
                <label style={lbl}>מתאריך</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lbl}>עד תאריך</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inp} />
              </div>
            </>
          )}

          <button onClick={loadReport} disabled={loading} style={{
            padding: '10px 20px', background: 'linear-gradient(135deg, #1d4ed8, #0ea5e9)',
            border: 'none', borderRadius: 10, color: 'white', fontWeight: 600, fontSize: 14,
            cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <BarChart3 size={16} />
            {loading ? 'טוען...' : 'הצג דוח'}
          </button>
        </div>
      </div>

      {rows.length > 0 && (
        <>
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
            <SummaryCard label="סה״כ כניסות" value={rows.length} color="#1d4ed8" />
            <SummaryCard label="סה״כ אנשים" value={totalPeople} color="#0284c7" />
            {Object.entries(byType).map(([type, count]) => (
              <SummaryCard key={type} label={entryTypeLabel(type)} value={count} color="#7c3aed" />
            ))}
          </div>

          {/* Export */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <button onClick={exportCSV} style={exportBtn}>
              <Download size={15} /> CSV
            </button>
            <button onClick={exportExcel} style={exportBtn}>
              <FileText size={15} /> Excel
            </button>
          </div>

          {/* Table */}
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #f3f4f6', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                    {['תאריך', 'משפחה', 'מס׳', 'כניסות', 'סוג'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#374151' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f9fafb' }}>
                      <td style={{ padding: '11px 16px' }}>{formatDate(r.entry_date)}</td>
                      <td style={{ padding: '11px 16px', fontWeight: 600 }}>{r.family_name}</td>
                      <td style={{ padding: '11px 16px', color: '#6b7280' }}>{r.family_number}</td>
                      <td style={{ padding: '11px 16px', fontWeight: 700, color: '#1d4ed8' }}>{r.people_count}</td>
                      <td style={{ padding: '11px 16px' }}>{entryTypeLabel(r.entry_type)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, padding: '16px', border: '1px solid #f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value.toLocaleString()}</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{label}</div>
    </div>
  )
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }
const inp: React.CSSProperties = { padding: '9px 12px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, outline: 'none' }
const sel: React.CSSProperties = { ...inp, cursor: 'pointer', background: 'white' }
const exportBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', background: '#f3f4f6', border: 'none', borderRadius: 8,
  fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151',
}
