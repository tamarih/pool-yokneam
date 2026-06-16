import { useEffect, useState } from 'react'
import React from 'react'
import { supabase } from '@/lib/supabase'
import { DashboardStats } from '@/types'
import { Users, CreditCard, Ticket, DoorOpen, TrendingUp, Calendar, PersonStanding, X, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import { formatTime } from '@/utils/format'

type EntryRange = 'inside' | 'today' | 'week' | 'month'

interface EntryRow {
  id: string
  people_count: number
  entry_time: string
  entry_date: string
  created_at: string
  member_names: string[] | null
  family_name_snapshot: string | null
  family: { family_name: string; first_name: string | null; family_number: string | null } | null
}

function StatCard({ icon: Icon, label, value, color, bg, onClick }: {
  icon: React.ElementType; label: string; value: number | string; color: string; bg: string; onClick?: () => void
}) {
  return (
    <div onClick={onClick} style={{
      background: 'white', borderRadius: 16, padding: '20px 24px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f3f4f6',
      display: 'flex', alignItems: 'center', gap: 16, animation: 'fadeIn 0.3s ease',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'transform 0.15s, box-shadow 0.15s',
    }}
    onMouseEnter={e => { if (onClick) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,0,0,0.08)' } }}
    onMouseLeave={e => { if (onClick) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)' } }}
    >
      <div style={{ width: 52, height: 52, borderRadius: 14, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={24} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#111827', lineHeight: 1 }}>{value.toLocaleString()}</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{label}</div>
      </div>
    </div>
  )
}

function EntriesModal({ range, onClose }: { range: EntryRange; onClose: () => void }) {
  const [rows, setRows] = useState<EntryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const now = new Date()
      let query = supabase
        .from('entries')
        .select('id, people_count, entry_time, entry_date, created_at, member_names, family_name_snapshot, family:families(family_name, first_name, family_number)')
        .eq('status', 'valid')
        .order('created_at', { ascending: false })

      if (range === 'inside') {
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()
        query = query.gte('created_at', twoHoursAgo)
      } else if (range === 'today') {
        query = query.eq('entry_date', now.toISOString().slice(0, 10))
      } else if (range === 'week') {
        const ws = new Date(now); ws.setDate(ws.getDate() - ws.getDay())
        query = query.gte('entry_date', ws.toISOString().slice(0, 10))
      } else if (range === 'month') {
        const ms = new Date(now.getFullYear(), now.getMonth(), 1)
        query = query.gte('entry_date', ms.toISOString().slice(0, 10))
      }

      const { data } = await query
      setRows((data ?? []) as any)
      setLoading(false)
    }
    load()
  }, [range])

  const titles: Record<EntryRange, string> = {
    inside: 'בבריכה עכשיו (≈2 שעות אחרונות)',
    today: 'כניסות היום',
    week: 'כניסות השבוע',
    month: 'כניסות החודש',
  }

  const totalPeople = rows.reduce((s, r) => s + r.people_count, 0)

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      padding: 20, direction: 'rtl',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'white', borderRadius: 16, width: '100%', maxWidth: 720,
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
      }}>
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid #f3f4f6',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#111827', margin: 0 }}>{titles[range]}</h2>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0 0' }}>
              {rows.length} רשומות · {totalPeople} אנשים
            </p>
          </div>
          <button onClick={onClose} style={{
            background: '#f3f4f6', border: 'none', borderRadius: 10,
            width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={18} color="#6b7280" />
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center' }}><LoadingSpinner /></div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>אין כניסות בטווח זה</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f9fafb' }}>
                <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                  {['תאריך', 'שעה', 'משפחה', 'מס׳', 'אנשים'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: '#374151', fontSize: 13 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const label = [r.family?.first_name, r.family?.family_name].filter(Boolean).join(' ')
                    || r.family_name_snapshot
                    || '—'
                  const isExpanded = expandedRow === r.id
                  const hasNames = (r.member_names?.length ?? 0) > 0
                  return (
                    <React.Fragment key={r.id}>
                      <tr
                        onClick={() => hasNames && setExpandedRow(isExpanded ? null : r.id)}
                        style={{
                          borderBottom: isExpanded ? 'none' : '1px solid #f9fafb',
                          cursor: hasNames ? 'pointer' : 'default',
                          background: isExpanded ? '#f9fafb' : 'transparent',
                        }}>
                        <td style={{ padding: '10px 16px', color: '#6b7280', fontSize: 13 }}>{r.entry_date}</td>
                        <td style={{ padding: '10px 16px', color: '#374151' }}>{formatTime(r.entry_time)}</td>
                        <td style={{ padding: '10px 16px', fontWeight: 600 }}>
                          {hasNames && <span style={{ color: '#9ca3af', marginLeft: 6 }}>{isExpanded ? '▼' : '◀'}</span>}
                          {label}
                        </td>
                        <td style={{ padding: '10px 16px', color: '#9ca3af', fontSize: 13 }}>{r.family?.family_number ?? '—'}</td>
                        <td style={{ padding: '10px 16px', fontWeight: 700, color: '#1d4ed8' }}>{r.people_count}</td>
                      </tr>
                      {isExpanded && hasNames && (
                        <tr style={{ borderBottom: '1px solid #f9fafb', background: '#f9fafb' }}>
                          <td colSpan={5} style={{ padding: '4px 16px 14px 16px' }}>
                            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>נכנסו:</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {r.member_names!.map((n, i) => (
                                <span key={i} style={{
                                  background: '#dbeafe', color: '#1e40af',
                                  borderRadius: 8, padding: '4px 10px',
                                  fontSize: 13, fontWeight: 600,
                                }}>{n}</span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function toCSV(rows: any[]): string {
  if (rows.length === 0) return ''
  const headers = Array.from(new Set(rows.flatMap(r => Object.keys(r))))
  const escape = (v: any) => {
    if (v === null || v === undefined) return ''
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n')
}

function downloadCSV(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Parse a CSV (with possible BOM) into array of objects keyed by header row
function parseCSV(text: string): Record<string, string>[] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQuotes = false
      else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { cur.push(field); field = '' }
      else if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = '' }
      else if (c === '\r') { /* skip */ }
      else field += c
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur) }
  if (rows.length === 0) return []
  const headers = rows[0]
  return rows.slice(1).filter(r => r.some(c => c.length > 0)).map(r => {
    const obj: Record<string, string> = {}
    headers.forEach((h, idx) => { obj[h] = r[idx] ?? '' })
    return obj
  })
}

// Normalize a CSV row for insert: empty string → null, numbers stay strings
// (Postgres/Supabase will cast). Drop computed/server-managed cols.
function cleanRow(r: Record<string, string>, drop: string[] = []): any {
  const out: any = {}
  for (const [k, v] of Object.entries(r)) {
    if (drop.includes(k)) continue
    if (v === '' || v === 'NULL' || v === 'null') out[k] = null
    else if (v.startsWith('{') || v.startsWith('[')) {
      try { out[k] = JSON.parse(v) } catch { out[k] = v }
    }
    else out[k] = v
  }
  return out
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalRange, setModalRange] = useState<EntryRange | null>(null)
  const [exporting, setExporting] = useState(false)

  async function restoreFromCSV(file: File, table: 'families' | 'family_members' | 'memberships' | 'punch_cards' | 'entries') {
    const text = await file.text()
    const rows = parseCSV(text)
    if (rows.length === 0) { toast.error('הקובץ ריק'); return }
    // remove generated/server-managed cols per table
    const drop: Record<string, string[]> = {
      families: ['updated_at'],
      family_members: [],
      memberships: [],
      punch_cards: ['remaining_entries', 'updated_at'],
      entries: [],
    }
    const cleaned = rows.map(r => cleanRow(r, drop[table]))
    let ok = 0, errors = 0
    const errorMsgs: string[] = []
    // upsert in chunks of 100
    for (let i = 0; i < cleaned.length; i += 100) {
      const chunk = cleaned.slice(i, i + 100)
      const { error, count } = await supabase.from(table).upsert(chunk, { onConflict: 'id', count: 'exact' })
      if (error) {
        errors += chunk.length
        if (errorMsgs.length < 3) errorMsgs.push(error.message)
      } else {
        ok += count ?? chunk.length
      }
    }
    if (errors > 0) {
      toast.error(`${table}: ${ok} שוחזרו, ${errors} שגיאות. ${errorMsgs[0] ?? ''}`)
    } else {
      toast.success(`${table}: ${ok} רשומות שוחזרו`)
    }
  }

  async function exportAll() {
    setExporting(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const [families, members, memberships, punchCards, entries] = await Promise.all([
        supabase.from('families').select('*'),
        supabase.from('family_members').select('*'),
        supabase.from('memberships').select('*'),
        supabase.from('punch_cards').select('*'),
        supabase.from('entries').select('*'),
      ])
      if (families.data) downloadCSV(`families_${today}.csv`, toCSV(families.data))
      if (members.data) downloadCSV(`members_${today}.csv`, toCSV(members.data))
      if (memberships.data) downloadCSV(`memberships_${today}.csv`, toCSV(memberships.data))
      if (punchCards.data) downloadCSV(`punch_cards_${today}.csv`, toCSV(punchCards.data))
      if (entries.data) downloadCSV(`entries_${today}.csv`, toCSV(entries.data))
      toast.success('ייצוא הסתיים — בדקי בתיקיית ההורדות')
    } catch (e: any) {
      toast.error('שגיאה בייצוא: ' + (e?.message ?? 'לא ידוע'))
    }
    setExporting(false)
  }

  useEffect(() => {
    async function load() {
      const { data } = await supabase.rpc('get_dashboard_stats')
      setStats(data)
      setLoading(false)
    }
    load()
    const interval = setInterval(load, 60_000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return <LoadingSpinner />

  const cards: Array<{ icon: React.ElementType; label: string; value: number; color: string; bg: string; range?: EntryRange }> = [
    { icon: Users, label: 'משפחות פעילות', value: stats?.active_families ?? 0, color: '#1d4ed8', bg: '#dbeafe' },
    { icon: CreditCard, label: 'מנויים פעילים', value: stats?.active_memberships ?? 0, color: '#0284c7', bg: '#e0f2fe' },
    { icon: Ticket, label: 'כרטיסיות פעילות', value: stats?.active_punch_cards ?? 0, color: '#7c3aed', bg: '#ede9fe' },
    { icon: DoorOpen, label: 'כניסות היום', value: stats?.entries_today ?? 0, color: '#16a34a', bg: '#dcfce7', range: 'today' },
    { icon: TrendingUp, label: 'כניסות השבוע', value: stats?.entries_week ?? 0, color: '#0369a1', bg: '#e0f2fe', range: 'week' },
    { icon: Calendar, label: 'כניסות החודש', value: stats?.entries_month ?? 0, color: '#9333ea', bg: '#f3e8ff', range: 'month' },
    { icon: PersonStanding, label: 'בבריכה עכשיו (≈2 שעות)', value: stats?.people_inside ?? 0, color: '#059669', bg: '#d1fae5', range: 'inside' },
  ]

  return (
    <div style={{ padding: '28px 28px', direction: 'rtl' }}>
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#111827' }}>דשבורד</h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>סטטיסטיקות בזמן אמת - מתעדכן כל דקה</p>
        </div>
        <button
          onClick={exportAll}
          disabled={exporting}
          title="הורדת CSV של כל הנתונים — מומלץ לפני פעולות גדולות"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: exporting ? '#e5e7eb' : '#f3f4f6',
            color: '#374151', border: '1px solid #e5e7eb',
            borderRadius: 10, padding: '10px 16px',
            fontSize: 14, fontWeight: 600, cursor: exporting ? 'not-allowed' : 'pointer',
          }}>
          <Download size={16} />
          {exporting ? 'מייצא...' : 'גיבוי CSV של כל הנתונים'}
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 16,
      }}>
        {cards.map(c => (
          <StatCard
            key={c.label}
            icon={c.icon}
            label={c.label}
            value={c.value}
            color={c.color}
            bg={c.bg}
            onClick={c.range ? () => setModalRange(c.range!) : undefined}
          />
        ))}
      </div>

      {(stats?.people_inside ?? 0) > 0 && (
        <div onClick={() => setModalRange('inside')} style={{
          marginTop: 24, background: 'linear-gradient(135deg, #0ea5e9, #1d4ed8)',
          borderRadius: 16, padding: '20px 28px', color: 'white',
          display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(14,165,233,0.3)',
        }}>
          <div style={{ fontSize: 48, fontWeight: 900 }}>{stats?.people_inside}</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>אנשים בבריכה כרגע</div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>על פי כניסות ב-2 השעות האחרונות · לחצי לרשימה</div>
          </div>
        </div>
      )}

      {/* Restore from CSV */}
      <RestoreSection onRestore={restoreFromCSV} />

      {modalRange && <EntriesModal range={modalRange} onClose={() => setModalRange(null)} />}
    </div>
  )
}

function RestoreSection({ onRestore }: {
  onRestore: (file: File, table: 'families' | 'family_members' | 'memberships' | 'punch_cards' | 'entries') => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const tables: { key: 'families' | 'family_members' | 'memberships' | 'punch_cards' | 'entries'; label: string }[] = [
    { key: 'families', label: 'משפחות' },
    { key: 'family_members', label: 'חברי משפחה' },
    { key: 'memberships', label: 'מנויים' },
    { key: 'punch_cards', label: 'כרטיסיות' },
    { key: 'entries', label: 'כניסות' },
  ]
  return (
    <div style={{
      marginTop: 24, background: 'white', border: '1px solid #f3f4f6',
      borderRadius: 16, padding: '20px 24px',
    }}>
      <button onClick={() => setOpen(!open)} style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280',
        fontSize: 14, fontWeight: 600,
      }}>
        {open ? '▼' : '◀'} שחזור מקובץ CSV (מתקדם)
      </button>
      {open && (
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16, lineHeight: 1.6 }}>
            ⚠️ העלי קבצי CSV (אלה שהתקבלו מ"גיבוי CSV"). השחזור עושה upsert — אם רשומה כבר קיימת לפי id היא תעודכן, אחרת תיווצר.<br/>
            סדר מומלץ: משפחות → חברי משפחה → מנויים → כרטיסיות → כניסות.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {tables.map(t => (
              <label key={t.key} style={{
                background: '#f9fafb', border: '1.5px dashed #d1d5db',
                borderRadius: 10, padding: '14px 16px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>📥 {t.label}</span>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>בחרי קובץ {t.key}_*.csv</span>
                <input
                  type="file"
                  accept=".csv"
                  style={{ display: 'none' }}
                  onChange={async e => {
                    const f = e.target.files?.[0]
                    if (f) await onRestore(f, t.key)
                    e.target.value = ''
                  }}
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
