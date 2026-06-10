import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Entry } from '@/types'
import { formatTime, entryTypeLabel, statusLabel, statusColor } from '@/utils/format'
import { RefreshCw, XCircle, Search } from 'lucide-react'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import toast from 'react-hot-toast'

export default function AdminEntries() {
  const [entries, setEntries] = useState<(Entry & { family: { family_name: string; family_number: string } | null })[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().slice(0, 10))
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [dateFilter])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('entries')
      .select('*, family:families(family_name, family_number)')
      .eq('entry_date', dateFilter)
      .order('created_at', { ascending: false })
    setEntries((data ?? []) as any)
    setLoading(false)
  }

  async function cancelEntry(id: string) {
    if (!confirm('לבטל כניסה זו?')) return
    const { error } = await supabase.from('entries').update({ status: 'cancelled' }).eq('id', id)
    if (error) toast.error('שגיאה בביטול')
    else { toast.success('הכניסה בוטלה'); load() }
  }

  const filtered = search
    ? entries.filter(e => e.family?.family_name.toLowerCase().includes(search.toLowerCase()) || e.family?.family_number.includes(search))
    : entries

  const totalPeople = filtered.filter(e => e.status === 'valid').reduce((s, e) => s + e.people_count, 0)

  if (loading) return <LoadingSpinner />

  return (
    <div style={{ padding: '28px', direction: 'rtl' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827' }}>כניסות</h1>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
          style={{ padding: '10px 12px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none' }} />
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש שם / מספר..."
            style={{ padding: '10px 36px 10px 12px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', width: 220 }} />
        </div>
        <button onClick={load} style={{ padding: '10px 14px', background: '#f3f4f6', border: 'none', borderRadius: 10, cursor: 'pointer', color: '#6b7280' }}>
          <RefreshCw size={16} />
        </button>
        <div style={{ marginRight: 'auto', background: '#dbeafe', borderRadius: 10, padding: '8px 16px', fontSize: 14, fontWeight: 600, color: '#1d4ed8' }}>
          סה״כ: {totalPeople} אנשים
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: 16, border: '1px solid #f3f4f6', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                {['שעה', 'משפחה', 'כניסות', 'סוג', 'סטטוס', 'ביטול'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#374151' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>אין כניסות לתאריך זה</td></tr>
              ) : filtered.map(e => {
                const sc = statusColor(e.status)
                return (
                  <tr key={e.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                    <td style={{ padding: '12px 16px', color: '#374151' }}>{formatTime(e.entry_time)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600 }}>{e.family?.family_name ?? '—'}</div>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>{e.family?.family_number}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 700, fontSize: 16, color: '#1d4ed8' }}>{e.people_count}</td>
                    <td style={{ padding: '12px 16px' }}>{entryTypeLabel(e.entry_type)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ ...sc, padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{statusLabel(e.status)}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {e.status === 'valid' && (
                        <button onClick={() => cancelEntry(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>
                          <XCircle size={17} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
