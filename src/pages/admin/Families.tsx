import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Family } from '@/types'
import { formatDate, membershipTypeLabel, statusLabel, statusColor } from '@/utils/format'
import { Plus, Search, RefreshCw, ChevronLeft } from 'lucide-react'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import FamilyFormModal from '@/components/admin/FamilyFormModal'

export default function AdminFamilies() {
  const navigate = useNavigate()
  const [families, setFamilies] = useState<Family[]>([])
  const [filtered, setFiltered] = useState<Family[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)

  useEffect(() => { load() }, [])

  useEffect(() => {
    let list = families
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(f =>
        f.family_name.toLowerCase().includes(q) ||
        (f.family_number ?? '').toLowerCase().includes(q) ||
        (f.phone ?? '').includes(q)
      )
    }
    if (statusFilter !== 'all') list = list.filter(f => f.status === statusFilter)
    setFiltered(list)
  }, [families, search, statusFilter])

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
                {['מס׳', 'שם משפחה', 'טלפון', 'סוג מנוי', 'תוקף', 'סטטוס', ''].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>לא נמצאו משפחות</td></tr>
              ) : filtered.map(f => {
                const sc = statusColor(f.status)
                return (
                  <tr key={f.id} style={{ borderBottom: '1px solid #f9fafb', cursor: 'pointer', transition: 'background 0.1s' }}
                    onClick={() => navigate(`/admin/families/${f.id}`)}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                  >
                    <td style={{ padding: '14px 16px', color: '#6b7280', fontWeight: 500 }}>{f.family_number}</td>
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: '#111827' }}>{f.family_name}</td>
                    <td style={{ padding: '14px 16px', color: '#374151', direction: 'ltr', textAlign: 'right' }}>{f.phone}</td>
                    <td style={{ padding: '14px 16px', color: '#374151' }}>{membershipTypeLabel(f.membership_type)}</td>
                    <td style={{ padding: '14px 16px', color: '#374151' }}>{f.end_date ? formatDate(f.end_date) : '—'}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ ...sc, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                        {statusLabel(f.status)}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <ChevronLeft size={16} color="#9ca3af" />
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
