/**
 * Database types.
 *
 * Hand-written to match supabase/migrations. Once a Supabase project exists,
 * regenerate instead of editing:
 *
 *   npm run db:types
 *
 * The enums below are the single source of truth for the app's string unions —
 * import from '@/types' rather than retyping literals in components.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type AppRole = 'super_admin' | 'admin' | 'moderator' | 'member' | 'guard'
export type OrgRole = 'admin' | 'guard'
export type FlatRole = 'moderator' | 'resident'
export type MembershipStatus = 'invited' | 'active' | 'suspended' | 'left'
export type OccupancyStatus = 'occupied' | 'vacant' | 'reserved' | 'not_rentable'
export type DueSource = 'rent' | 'utility' | 'expense' | 'penalty' | 'other'
export type DueStatus = 'open' | 'partially_paid' | 'paid' | 'waived'
export type PaymentMethod =
  'cash' | 'bkash' | 'nagad' | 'bank_transfer' | 'card' | 'other'
export type PaymentStatus = 'pending' | 'confirmed' | 'rejected' | 'failed' | 'refunded'
export type ExpenseScope = 'building' | 'flat'
export type ExpenseCategory =
  | 'electricity'
  | 'gas'
  | 'water'
  | 'internet'
  | 'cleaning'
  | 'security'
  | 'lift'
  | 'repair'
  | 'other'
export type SplitMethod = 'equal' | 'custom' | 'by_unit_size' | 'by_usage'
export type VisitorState = 'pre_approved' | 'inside' | 'exited' | 'denied'
export type MaintenanceStatus = 'open' | 'in_progress' | 'resolved' | 'cancelled'
export type MaintenancePriority = 'low' | 'normal' | 'high' | 'urgent'
export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'push'
export type TransferStatus =
  'pending' | 'accepted' | 'rejected' | 'expired' | 'rolled_back'
export type PlanTier = 'free' | 'pro'
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled'

/** Columns every table carries. */
type Timestamps = {
  created_at: string
  updated_at: string
}

export type ProfileRow = Timestamps & {
  id: string
  email: string
  full_name: string
  phone: string | null
  phone_verified_at: string | null
  avatar_url: string | null
  locale: 'en' | 'bn'
  platform_role: AppRole
  last_seen_at: string | null
}

export type OrganizationRow = Timestamps & {
  id: string
  name: string
  slug: string
  owner_id: string
  country: string
  timezone: string
  currency: string
  suspended_at: string | null
}

export type OrgMemberRow = Timestamps & {
  id: string
  org_id: string
  user_id: string
  role: OrgRole
  status: MembershipStatus
  invited_by: string | null
}

export type SubscriptionRow = Timestamps & {
  id: string
  org_id: string
  plan: PlanTier
  status: SubscriptionStatus
  unit_limit: number
  building_limit: number
  current_period_start: string
  current_period_end: string | null
  provider: string | null
  provider_reference: string | null
  cancelled_at: string | null
}

export type BuildingRow = Timestamps & {
  id: string
  org_id: string
  name: string
  address_line: string
  area: string | null
  city: string
  postcode: string | null
  floors_count: number
  amenities: string[]
  photo_url: string | null
  notes: string | null
  archived_at: string | null
  created_by: string
}

export type FlatRow = Timestamps & {
  id: string
  building_id: string
  unit_number: string
  floor: number
  size_sqft: number | null
  bedrooms: number | null
  monthly_rent: number
  landlord_rent: number
  rent_due_day: number
  occupancy_status: OccupancyStatus
  archived_at: string | null
}

export type FlatMemberRow = Timestamps & {
  id: string
  flat_id: string
  user_id: string
  role: FlatRole
  rent_share: number
  status: MembershipStatus
  joined_at: string
  left_at: string | null
  left_reason: string | null
}

export type DueRow = Timestamps & {
  id: string
  flat_id: string
  user_id: string | null
  source: DueSource
  source_id: string | null
  period: string
  amount: number
  amount_paid: number
  due_date: string
  status: DueStatus
  carried_from: string | null
  description: string | null
  created_by: string | null
}

export type PaymentRow = Timestamps & {
  id: string
  flat_id: string
  due_id: string | null
  paid_by: string | null
  amount: number
  method: PaymentMethod
  status: PaymentStatus
  paid_at: string
  reference: string | null
  transaction_id: string | null
  proof_url: string | null
  gateway: string | null
  gateway_payload: Json | null
  note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  rejection_reason: string | null
  receipt_no: string | null
}

export type ExpenseRow = Timestamps & {
  id: string
  building_id: string
  flat_id: string | null
  scope: ExpenseScope
  category: ExpenseCategory
  title: string
  amount: number
  period: string
  split_method: SplitMethod
  billed_on: string | null
  bill_url: string | null
  meter_reading: number | null
  created_by: string
}

export type VisitorRow = Timestamps & {
  id: string
  building_id: string
  flat_id: string | null
  full_name: string
  phone: string | null
  purpose: string | null
  photo_url: string | null
  state: VisitorState
  entry_code: string | null
  expected_at: string | null
  entered_at: string | null
  exited_at: string | null
  pre_approved_by: string | null
  logged_by: string | null
  is_blocked: boolean
  block_reason: string | null
}

export type MaintenanceRow = Timestamps & {
  id: string
  building_id: string
  flat_id: string | null
  reference: string
  title: string
  description: string
  category: ExpenseCategory
  priority: MaintenancePriority
  status: MaintenanceStatus
  photo_urls: string[]
  reported_by: string
  assigned_to: string | null
  resolved_at: string | null
  resolution: string | null
}

export type NotificationRow = {
  id: string
  user_id: string
  org_id: string | null
  event: string
  title: string
  body: string | null
  link: string | null
  channel: NotificationChannel
  data: Json
  read_at: string | null
  created_at: string
}

export type InviteRow = {
  id: string
  org_id: string
  flat_id: string | null
  email: string
  role: AppRole
  rent_share: number | null
  token_hash: string
  invited_by: string
  expires_at: string
  accepted_at: string | null
  accepted_by: string | null
  revoked_at: string | null
  created_at: string
}

export type ExpenseShareRow = {
  id: string
  expense_id: string
  flat_id: string
  amount: number
  due_id: string | null
  created_at: string
}

export type LandlordRentRow = Timestamps & {
  id: string
  flat_id: string
  period: string
  amount: number
  paid_at: string | null
  reference: string | null
  recorded_by: string | null
}

export type ModeratorTransferRow = {
  id: string
  flat_id: string
  from_user_id: string
  to_user_id: string
  status: TransferStatus
  otp_verified_at: string | null
  responded_at: string | null
  expires_at: string
  rolled_back_at: string | null
  rolled_back_by: string | null
  created_at: string
}

export type AuditLogRow = {
  id: number
  org_id: string | null
  actor_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  before_data: Json | null
  after_data: Json | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

/**
 * Shape Supabase expects: Row for reads, Insert for writes, Update for patches.
 * `Required` lists the columns that have no default and no null — everything
 * else may be omitted on insert.
 */
type TableDef<Row, RequiredKeys extends keyof Row> = {
  Row: Row
  Insert: Pick<Row, RequiredKeys> & Partial<Omit<Row, RequiredKeys>>
  Update: Partial<Row>
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      profiles: TableDef<ProfileRow, 'id' | 'email' | 'full_name'>
      organizations: TableDef<OrganizationRow, 'name' | 'slug' | 'owner_id'>
      org_members: TableDef<OrgMemberRow, 'org_id' | 'user_id' | 'role'>
      subscriptions: TableDef<SubscriptionRow, 'org_id'>
      buildings: TableDef<BuildingRow, 'org_id' | 'name' | 'address_line' | 'created_by'>
      flats: TableDef<FlatRow, 'building_id' | 'unit_number' | 'floor'>
      flat_members: TableDef<FlatMemberRow, 'flat_id' | 'user_id'>
      dues: TableDef<DueRow, 'flat_id' | 'source' | 'period' | 'amount' | 'due_date'>
      payments: TableDef<PaymentRow, 'flat_id' | 'amount'>
      expenses: TableDef<
        ExpenseRow,
        'building_id' | 'category' | 'title' | 'amount' | 'period' | 'created_by'
      >
      visitors: TableDef<VisitorRow, 'building_id' | 'full_name'>
      maintenance_requests: TableDef<
        MaintenanceRow,
        'building_id' | 'reference' | 'title' | 'description' | 'reported_by'
      >
      invites: TableDef<
        InviteRow,
        'org_id' | 'email' | 'role' | 'token_hash' | 'invited_by' | 'expires_at'
      >
      expense_shares: TableDef<ExpenseShareRow, 'expense_id' | 'flat_id' | 'amount'>
      landlord_rent_records: TableDef<LandlordRentRow, 'flat_id' | 'period' | 'amount'>
      moderator_transfers: TableDef<
        ModeratorTransferRow,
        'flat_id' | 'from_user_id' | 'to_user_id' | 'expires_at'
      >
      notifications: TableDef<NotificationRow, 'user_id' | 'event' | 'title'>
      audit_logs: TableDef<AuditLogRow, 'action' | 'entity_type'>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      app_role: AppRole
      org_role: OrgRole
      flat_role: FlatRole
    }
    CompositeTypes: Record<string, never>
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type InsertDto<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type UpdateDto<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
