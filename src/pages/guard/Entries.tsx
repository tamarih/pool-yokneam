import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatTime, entryTypeLabel } from '@/utils/format'
import { RefreshCw } from 'lucide-react'
import LoadingSpinner from '@/components/shared/LoadingSpinner'

interface EntryRow {
  id: string
  entry_time: string
  people_count: number
  entry_type: string
  family: { family_name: string; family_number: string } | null
}

export default function GuardEntries() {
  const [entries, setEntries] = useState<EntryRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await supabase
      .from('entries')
      .select('id, entry_time, people_count, entry_type, family:families(family_name, family_number)')
      .eq('entry_date', today)
      .eq('status', 'valid')
      .order('created_at', { ascending: false })
    setEntries((data ?? []) as any)
    setLoading(false)
  }

  const total = entries.reduce((s, e) => s + e.people_count, 0)

  if (loading) return <LoadingSpinner size="md" />

  return (
    <div style={{ direction: 'rtl' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontWeight: 800, fontSize: 20 }}>כניסות היום</h2>
          <p style={{ color: '#6b7280', fontSize: 14 }}>סה״כ {total} אנשים ב-{entries.length} כניסות</p>
        </div>
        <button onClick={load} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, cursor: 'pointer', padding: 8, color: '#6b7280' }}>
          <RefreshCw size={16} />
        </button>
      </div>

      {entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>אין כניסות היום עדיין</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.map(e => (
            <div key={e.id} style={{
              background: 'white', borderRadius: 12, padding: '14px 16px',
              border: '1px solid #f3f4f6', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{e.family?.family_name ?? '—'}</div>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                  {formatTime(e.entry_time)} · {entryTypeLabel(e.entry_type)}
                </div>
              </div>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 18, color: '#1d4ed8',
              }}>
                {e.people_count}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
