import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Family } from '@/types'
import { formatDate, membershipTypeLabel, statusLabel, statusColor } from '@/utils/format'
import { Plus, Search, RefreshCw, ChevronLeft, Trash2 } from 'lucide-react'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import FamilyFormModal from '@/components/admin/FamilyFormModal'

type SortKey = 'family_number' | 'first_name' | 'family_name' | 'phone' | 'membership_type' | 'end_date' | 'status'
type SortDirection = 'asc' | 'desc'

const collator = new Intl.Collator('he', { numeric: true, sensitivity: 'base' })

const sortableHeaders: { label: string; sortKey?: SortKey }[] = [
  { label: 'מס׳', sortKey: 'family_number' },
  { label: 'שם פרטי', sortKey: 'first_name' },
  { label: 'שם משפחה', sortKey: 'family_name' },
  { label: 'טלפון', sortKey: 'phone' },
  { label: 'סוג מנוי', sortKey: 'membership_type' },
  { label: 'תוקף', sortKey: 'end_date' },
  { label: 'סטטוס', sortKey: 'status' },
  { label: '' },
]

function sortValue(family: Family, key: SortKey): string {
  const value = family[key]
  return value == null ? '' : String(value)
}
export default function AdminFamilies() {
  const navigate = useNavigate()
  const [families, setFamilies] = useState<Family[]>([])
  const [filtered, setFiltered] = useState<Family[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('family_name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  async function deleteFamily(e: React.MouseEvent, id: string, name: string) {
    e.stopPropagation()
    if (!confirm(`למחוק את ${name}? פעולה זו לא ניתנת לביטול.`)) return
    setDeletingId(id)
    await supabase.from('families').delete().eq('id', id)
    setDeletingId(null)
    load()
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    let list = [...families]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(f =>
        f.family_name.toLowerCase().includes(q) ||
        (f.first_name ?? '').toLowerCase().includes(q) ||
        (f.family_number ?? '').toLowerCase().includes(q) ||
        (f.phone ?? '').includes(q)
      )
    }
    if (statusFilter !== 'all') list = list.filter(f => f.status === statusFilter)
    list.sort((a, b) => {
      const result = collator.compare(sortValue(a, sortKey), sortValue(b, sortKey))
      return sortDirection === 'asc' ? result : -result
    })
    setFiltered(list)
  }, [families, search, statusFilter, sortKey, sortDirection])

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(nextKey)
      setSortDirection('asc')
    }
  }

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('families')
      .select('*')
      .order('family_name')
    setFamilies(data ?? [])
    setLoading(false)
  }

  if (loading) return <LoadingSpinner />

  return (
    <div style={{ padding: '28px', direction: 'rtl' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827' }}>ניהול משפחות</h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>{families.length} משפחות במערכת</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{
          background: 'linear-gradient(135deg, #1d4ed8, #0ea5e9)',
          color: 'white', border: 'none', borderRadius: 10,
          padding: '10px 20px', fontSize: 14, fontWeight: 600,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 12px rgba(14,165,233,0.3)',
        }}>
          <Plus size={18} />
          הוסף משפחה
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 280px' }}>
          <Search size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם, מספר, טלפון..."
            style={{
              width: '100%', padding: '10px 38px 10px 14px',
              border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none',
            }}
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{
          padding: '10px 14px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', cursor: 'pointer',
        }}>
          <option value="all">כל הסטטוסים</option>
          <option value="active">פעיל</option>
          <option value="inactive">לא פעיל</option>
          <option value="suspended">מושהה</option>
        </select>
        <button onClick={load} style={{ padding: '10px 14px', background: '#f3f4f6', border: 'none', borderRadius: 10, cursor: 'pointer', color: '#6b7280' }}>
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Table */}
      <div style={{ background: 'white', borderRadius: 16, border: '1px solid #f3f4f6', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                {sortableHeaders.map(h => {
                  const isActive = sortKey === h.sortKey
                  return (
                    <th
                      key={h.label || 'actions'}
                      onClick={h.sortKey ? () => toggleSort(h.sortKey!) : undefined}
                      title={h.sortKey ? 'לחצי למיון' : undefined}
                      style={{
                        padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: isActive ? '#1d4ed8' : '#374151',
                        whiteSpace: 'nowrap', cursor: h.sortKey ? 'pointer' : 'default', userSelect: 'none',
                      }}
                    >
                      {h.sortKey ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span>{h.label}</span>
                          <span style={{ color: isActive ? '#1d4ed8' : '#9ca3af', fontSize: 12, minWidth: 12 }}>
                            {isActive ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                          </span>
                        </span>
                      ) : h.label}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>לא נמצאו משפחות</td></tr>
              ) : filtered.map(f => {
                const sc = statusColor(f.status)
                return (
                  <tr key={f.id} style={{ borderBottom: '1px solid #f9fafb', cursor: 'pointer', transition: 'background 0.1s' }}
                    onClick={() => navigate(`/admin/families/${f.id}`)}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                  >
                    <td style={{ padding: '14px 16px', color: '#6b7280', fontWeight: 500 }}>{f.family_number}</td>
                    <td style={{ padding: '14px 16px', color: '#374151' }}>{f.first_name ?? ''}</td>
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: '#111827' }}>{f.family_name}</td>
                    <td style={{ padding: '14px 16px', color: '#374151', direction: 'ltr', textAlign: 'right' }}>{f.phone}</td>
                    <td style={{ padding: '14px 16px', color: '#374151' }}>{membershipTypeLabel(f.membership_type)}</td>
                    <td style={{ padding: '14px 16px', color: '#374151' }}>{f.end_date ? formatDate(f.end_date) : '—'}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ ...sc, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                        {statusLabel(f.status)}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ChevronLeft size={16} color="#9ca3af" />
                      <button
                        onClick={e => deleteFamily(e, f.id, `${f.first_name ?? ''} ${f.family_name}`)}
                        disabled={deletingId === f.id}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: '#ef4444', padding: 4, borderRadius: 6,
                          opacity: deletingId === f.id ? 0.5 : 1,
                        }}
                        title="מחק משפחה"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && <FamilyFormModal onClose={() => { setShowForm(false); load() }} />}
    </div>
  )
}
