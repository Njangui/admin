// ================================================================
// HABYNEX ADMIN — Types TypeScript v2.1
// Synchronisé avec Habynex-final/src/types/index.ts
// ================================================================

export type UserRole = 'user' | 'agent' | 'photographer' | 'admin' | 'super_admin' | 'ai_system'
export type ListingType = 'apartment' | 'duplex' | 'studio' | 'villa' | 'room' | 'commercial'
export type TransactionType = 'rent' | 'sale' | 'short_stay' | 'coliving' | 'furnished'
export type ListingStatus = 'draft' | 'pending_review' | 'published' | 'rented' | 'archived'
export type AgentStatus = 'pending' | 'reviewing' | 'active' | 'suspended' | 'rejected'
export type CommissionModel = 'A' | 'B'
export type VisitStatus = 'pending_payment' | 'paid' | 'scheduled' | 'confirmed' | 'reminder_sent' | 'completed' | 'cancelled' | 'refunded'
export type CommissionStatus = 'pending' | 'due' | 'collected' | 'paid_agent'
export type MessageRole = 'user' | 'ai' | 'admin'
export type NotificationChannel = 'push' | 'in_app' | 'whatsapp' | 'sms'
export type MediaType = 'image' | 'image_360' | 'video'

// ── Géographie ──────────────────────────────────────────────────
export interface Country {
  id: string; name: string; name_en: string; code: string
  currency: string; is_active: boolean; created_at: string
}

export interface City {
  id: string; country_id: string; name: string; name_en: string | null
  slug: string; lat: number | null; lng: number | null
  seo_title: string | null; seo_description: string | null
  is_active: boolean; created_at: string
}

export interface Neighborhood {
  id: string; city_id: string; name: string; slug: string
  lat: number | null; lng: number | null
  seo_title: string | null; seo_description: string | null
  is_active: boolean; display_order: number; created_at: string
  city?: City
}

// ── Utilisateurs ─────────────────────────────────────────────────
export interface Profile {
  id: string; full_name: string | null; phone: string | null
  city_id: string | null; avatar_url: string | null
  referral_code: string | null; referred_by: string | null
  free_visits_balance: number; language: string; dark_mode: boolean
  criteria: UserCriteria | null; is_blacklisted: boolean
  created_at: string; updated_at: string
  city?: City; roles?: UserRole[]
}

export interface UserCriteria {
  city_id?: string
  city_name?: string
  neighborhood_ids?: string[]
  neighborhood_names?: string[]
  budget_min?: number; budget_max?: number
  types?: ListingType[]; transaction?: TransactionType
  bedrooms_min?: number; furnished?: boolean
  lifestyle?: string; priorities?: string[]
}

// ── Annonces ─────────────────────────────────────────────────────
export interface Listing {
  id: string; slug: string | null; title: string; description: string | null
  type: ListingType; transaction: TransactionType; price: number
  price_negotiable: boolean; neighborhood_id: string | null
  address_hint: string | null; lat: number | null; lng: number | null
  bedrooms: number | null; bathrooms: number | null
  surface_m2: number | null; floor: number | null; furnished: boolean
  amenities: ListingAmenities | null; status: ListingStatus
  published_at: string | null; published_by: string | null
  photographer_id: string | null; meta_title: string | null
  meta_description: string | null; ai_generated: boolean
  view_count: number; favorite_count: number
  created_at: string; updated_at: string
  neighborhood?: Neighborhood; media?: ListingMedia[]
  is_favorited?: boolean
}

export interface ListingAmenities {
  wifi?: boolean; parking?: boolean; security?: boolean
  water_24h?: boolean; electricity?: boolean; generator?: boolean
  air_conditioning?: boolean; garden?: boolean; terrace?: boolean
}

export interface ListingMedia {
  id: string; listing_id: string; url: string; type: MediaType
  is_cover: boolean; display_order: number; created_at: string
}

// ── Visites ──────────────────────────────────────────────────────
export interface VisitBooking {
  id: string; client_id: string; listing_ids: string[]
  nb_listings: number; amount_paid: number; is_free: boolean
  payment_ref: string | null; payment_method: 'mtn' | 'orange' | null
  paid_at: string | null; scheduled_at: string | null
  agent_id: string | null; confirmed_at: string | null
  status: VisitStatus; reminder_24h_sent: boolean
  refunded: boolean; refund_reason: string | null
  outcome: 'success' | 'failure' | null
  chosen_listing_id: string | null
  admin_notes: string | null; created_at: string; updated_at: string
  client?: Profile; agent?: Agent; listings?: Listing[]
}

// ── Agents ───────────────────────────────────────────────────────
export interface Agent {
  id: string; neighborhood_id: string | null
  commission_model: CommissionModel; status: AgentStatus
  application_answers: Record<string, string> | null
  ai_score: number | null; id_document_url: string | null
  selfie_url: string | null; validated_by: string | null
  validated_at: string | null; rejection_reason: string | null
  weekly_availability: WeeklyAvailability | null
  missions_completed: number; success_rate: number | null
  rating_avg: number | null; created_at: string; updated_at: string
  profile?: Profile; neighborhood?: Neighborhood
}

export type WeekDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
export type WeeklyAvailability = Record<WeekDay, string[]>

// ── Commissions ──────────────────────────────────────────────────
export interface Commission {
  id: string; booking_id: string; agent_id: string; listing_id: string
  property_price: number; owner_commission: number; tenant_commission: number
  total_commission: number; commission_model: CommissionModel
  suggested_rate: number; agent_amount: number; taxi_allowance: number
  habynex_amount: number; status: CommissionStatus
  owner_paid: boolean; owner_paid_at: string | null; owner_payment_ref: string | null
  tenant_paid: boolean; tenant_paid_at: string | null; tenant_payment_ref: string | null
  agent_paid: boolean; agent_paid_at: string | null; agent_payment_ref: string | null
  created_by: string | null; validated_by: string | null
  validated_at: string | null; notes: string | null
  created_at: string; updated_at: string
  agent?: Agent; booking?: VisitBooking; listing?: Listing
}

// ── Messagerie ───────────────────────────────────────────────────
export interface Conversation {
  id: string; listing_id: string; client_id: string
  ai_active: boolean; escalated_to: string | null
  escalated_at: string | null; escalation_reason: string | null
  last_message_at: string | null; unread_count: number; created_at: string
  listing?: Listing; client?: Profile; messages?: Message[]; last_message?: Message
}

export interface Message {
  id: string; conversation_id: string; sender_id: string | null
  role: MessageRole; content: string
  attachments: MessageAttachment[] | null
  is_delivered: boolean; is_read: boolean
  delivered_at: string | null; read_at: string | null; created_at: string
}

export interface MessageAttachment {
  url: string; type: 'image' | 'document'; name: string; size?: number
}

// ── Notifications ────────────────────────────────────────────────
export interface Notification {
  id: string; user_id: string; channel: NotificationChannel
  title: string; body: string; action_url: string | null
  metadata: Record<string, unknown> | null
  is_read: boolean; read_at: string | null; sent_at: string
}

// ── Notes agents ─────────────────────────────────────────────────
export interface AgentRating {
  id: string; agent_id: string; client_id: string
  booking_id: string | null; stars: number; comment: string | null
  created_at: string; updated_at: string
}

export interface AgentRatingSummary {
  agent_id: string; total_ratings: number; average_stars: number
  stars_5: number; stars_4: number; stars_3: number; stars_2: number; stars_1: number
}

// ── Contrats agents ──────────────────────────────────────────────
export interface AgentContract {
  id: string; agent_id: string; signature_data: string | null
  fingerprint: string | null; signed_at: string; ip_info: string | null
  status: 'signed' | 'revoked' | 'expired'; created_at: string
}

// ── Push notifications ───────────────────────────────────────────
export interface PushLog {
  id: string; type: string; title: string; message: string | null
  url: string | null; target_user_id: string | null
  sent_count: number; failed_count: number; expired_count: number
  created_at: string
}

export interface PushSubscription {
  id: string; user_id: string; endpoint: string
  p256dh: string; auth: string; user_agent: string | null; created_at: string
}

// ── IA ───────────────────────────────────────────────────────────
export interface DailyReport {
  id: string; report_date: string; content: string
  suggestions: ReportSuggestion[] | null; kpi_snapshot: KpiSnapshot | null
  generated_at: string; read_by: string[] | null; created_at: string
}

export interface ReportSuggestion {
  type: 'pricing' | 'marketing' | 'agent' | 'security' | 'general'
  title: string; description: string; priority: 'low' | 'medium' | 'high'
}

export interface KpiSnapshot {
  new_users: number; messages_sent: number; bookings: number
  published_listings: number; revenue_estimate: number
  active_agents: number; visits_completed: number
}

// ── Paramètres app ───────────────────────────────────────────────
export interface AppSettings {
  visit_price_1: number; visit_price_2: number; visit_price_3: number
  referral_visits_threshold: number
  ai_model: string; ai_escalation_enabled: boolean
  maintenance_mode: boolean; maintenance_message: string
  whatsapp_contact: string; contact_email: string
  launch_cities: string[]; features: Record<string, boolean>
  campay_enabled?: boolean
  push_notifications_enabled?: boolean
}
