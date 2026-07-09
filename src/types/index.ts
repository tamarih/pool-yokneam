export type UserRole = 'admin' | 'guard' | 'member'

export type MembershipType = 'seasonal' | 'annual' | 'punch_card'

export type FamilyStatus = 'active' | 'inactive' | 'suspended'

export type EntryType = 'membership' | 'punch_card' | 'guest'

export type EntryStatus = 'valid' | 'cancelled'

export type PunchCardStatus = 'active' | 'depleted' | 'expired'

export interface Profile {
  id: string
  email: string
  role: UserRole
  full_name: string
  created_at: string
}

export interface Family {
  id: string
  family_number: string | null
  family_name: string
  first_name: string | null
  phone: string
  address: string | null
  membership_type: MembershipType
  start_date: string | null
  end_date: string | null
  status: FamilyStatus
  qr_token: string
  notes: string | null
  resident_type: 'local' | 'external' | null
  created_at: string
  updated_at: string
}

export interface FamilyMember {
  id: string
  family_id: string
  first_name: string
  last_name: string
  birth_date: string | null
  notes: string | null
  created_at: string
}

export interface Membership {
  id: string
  family_id: string
  type: MembershipType
  type_label: string | null
  start_date: string
  end_date: string | null
  active: boolean
  price: number | null
  notes: string | null
  phone: string | null
  phones: string[]
  grandchildren_count: number | null
  created_at: string
}

export interface PunchCard {
  id: string
  family_id: string
  purchased_entries: number
  used_entries: number
  remaining_entries: number
  expiry_date: string | null
  status: PunchCardStatus
  price: number | null
  notes: string | null
  phone: string | null
  phones: string[]
  created_at: string
  updated_at: string
}

export interface Entry {
  id: string
  family_id: string | null
  family_name_snapshot: string | null
  entry_date: string
  entry_time: string
  people_count: number
  entry_type: EntryType
  guard_user_id: string | null
  punch_card_id: string | null
  status: EntryStatus
  notes: string | null
  member_names: string[]
  created_at: string
  family?: Family
  guard?: Profile
}

export interface DashboardStats {
  active_families: number
  active_memberships: number
  active_punch_cards: number
  entries_today: number
  entries_week: number
  entries_month: number
  people_inside: number
}

export interface QRScanResult {
  family: Family
  membership: Membership | null
  punch_card: PunchCard | null
  last_entry: Entry | null
  is_valid: boolean
  error_message: string | null
}
