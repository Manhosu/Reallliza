// ============================================================
// Enums
// ============================================================

export enum UserRole {
  ADMIN = "admin",
  TECHNICIAN = "technician",
  PARTNER = "partner",
}

export enum UserStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  SUSPENDED = "suspended",
  PENDING = "pending",
}

export enum OsStatus {
  DRAFT = "draft",
  PENDING = "pending",
  ASSIGNED = "assigned",
  IN_PROGRESS = "in_progress",
  PAUSED = "paused",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
  REJECTED = "rejected",
}

export enum OsPriority {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  URGENT = "urgent",
}

export enum PhotoType {
  BEFORE = "before",
  DURING = "during",
  AFTER = "after",
  ISSUE = "issue",
  SIGNATURE = "signature",
}

export enum ToolStatus {
  AVAILABLE = "available",
  IN_CUSTODY = "in_custody",
  MAINTENANCE = "maintenance",
  RETIRED = "retired",
}

export enum ToolCondition {
  NEW = "new",
  GOOD = "good",
  FAIR = "fair",
  POOR = "poor",
  DAMAGED = "damaged",
}

export enum NotificationType {
  OS_CREATED = "os_created",
  OS_ASSIGNED = "os_assigned",
  OS_STATUS_CHANGED = "os_status_changed",
  OS_COMPLETED = "os_completed",
  OS_CANCELLED = "os_cancelled",
  SCHEDULE_REMINDER = "schedule_reminder",
  TOOL_CUSTODY = "tool_custody",
  SYSTEM = "system",
}

export enum ScheduleStatus {
  SCHEDULED = "scheduled",
  CONFIRMED = "confirmed",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
  RESCHEDULED = "rescheduled",
}

export enum FeedAudience {
  ALL = "all",
  EMPLOYEES = "employees",
  PARTNERS = "partners",
}

export enum ProposalStatus {
  PENDING = "pending",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
  EXPIRED = "expired",
}

// ============================================================
// Database Entity Interfaces
// ============================================================

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  status: UserStatus;
  cpf: string | null;
  rg: string | null;
  address: string | null;
  specialties: string[] | null;
  operating_region: string | null;
  documents_urls: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface Partner {
  id: string;
  user_id: string;
  company_name: string;
  cnpj: string | null;
  trading_name: string | null;
  contact_name: string;
  contact_phone: string | null;
  contact_email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ServiceOrder {
  id: string;
  order_number: string;
  title: string;
  description: string | null;
  status: OsStatus;
  priority: OsPriority;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  client_document: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  geo_lat: number | null;
  geo_lng: number | null;
  partner_id: string | null;
  technician_id: string | null;
  created_by: string;
  scheduled_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  estimated_value: number | null;
  final_value: number | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  tracking_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface Checklist {
  id: string;
  service_order_id: string;
  template_id: string | null;
  title: string;
  items: ChecklistItem[];
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
  notes: string | null;
  checked_at: string | null;
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  description: string | null;
  items: ChecklistTemplateItem[];
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ChecklistTemplateItem {
  id: string;
  label: string;
  required: boolean;
  order: number;
}

export interface Photo {
  id: string;
  service_order_id: string;
  type: PhotoType;
  url: string;
  thumbnail_url: string | null;
  description: string | null;
  geo_lat: number | null;
  geo_lng: number | null;
  taken_at: string | null;
  uploaded_by: string;
  created_at: string;
}

export interface ToolInventory {
  id: string;
  name: string;
  description: string | null;
  serial_number: string | null;
  status: ToolStatus;
  condition: ToolCondition;
  category: string | null;
  purchase_date: string | null;
  purchase_value: number | null;
  notes: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ToolCustody {
  id: string;
  tool_id: string;
  user_id: string;
  service_order_id: string | null;
  checked_out_at: string;
  checked_in_at: string | null;
  condition_out: ToolCondition;
  condition_in: ToolCondition | null;
  notes: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface OsStatusHistory {
  id: string;
  service_order_id: string;
  from_status: OsStatus | null;
  to_status: OsStatus;
  changed_by: string;
  notes: string | null;
  created_at: string;
}

export interface Schedule {
  id: string;
  service_order_id: string;
  technician_id: string;
  date: string;
  start_time: string;
  end_time: string | null;
  status: ScheduleStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeedPost {
  id: string;
  author_id: string;
  title: string;
  content: string;
  media_urls: string[];
  audience: FeedAudience;
  is_pinned: boolean;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  author?: { id: string; full_name: string; avatar_url: string | null };
}

export interface ProfessionalRating {
  id: string;
  professional_id: string;
  rated_by: string;
  service_order_id: string | null;
  quality_score: number;
  punctuality_score: number;
  organization_score: number;
  communication_score: number;
  notes: string | null;
  created_at: string;
  professional?: { id: string; full_name: string };
  rated_by_user?: { id: string; full_name: string };
  service_order?: { id: string; title: string };
}

export interface ServiceProposal {
  id: string;
  service_order_id: string;
  partner_id: string;
  proposed_by: string;
  status: ProposalStatus;
  proposed_value: number | null;
  message: string | null;
  response_message: string | null;
  responded_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  service_order?: { id: string; title: string; client_name: string };
  partner?: { id: string; company_name: string };
}

export interface TechnicianLocation {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  latitude: number;
  longitude: number;
  recorded_at: string;
  service_order: { id: string; title: string; status: string; client_name: string };
}

export interface UserConsent {
  id: string;
  user_id: string;
  terms_version: string;
  terms_accepted_at: string | null;
  privacy_accepted_at: string | null;
  location_consent: boolean;
  image_consent: boolean;
}

// ============================================================
// API Response Types
// ============================================================

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

// ============================================================
// Helper / Display Types
// ============================================================

export const OS_STATUS_LABELS: Record<OsStatus, string> = {
  [OsStatus.DRAFT]: "Rascunho",
  [OsStatus.PENDING]: "Pendente",
  [OsStatus.ASSIGNED]: "Atribuída",
  [OsStatus.IN_PROGRESS]: "Em Andamento",
  [OsStatus.PAUSED]: "Pausada",
  [OsStatus.COMPLETED]: "Concluída",
  [OsStatus.CANCELLED]: "Cancelada",
  [OsStatus.REJECTED]: "Rejeitada",
};

export const OS_PRIORITY_LABELS: Record<OsPriority, string> = {
  [OsPriority.LOW]: "Baixa",
  [OsPriority.MEDIUM]: "Média",
  [OsPriority.HIGH]: "Alta",
  [OsPriority.URGENT]: "Urgente",
};

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.ADMIN]: "Administrador",
  [UserRole.TECHNICIAN]: "Técnico",
  [UserRole.PARTNER]: "Parceiro",
};

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  [UserStatus.ACTIVE]: "Ativo",
  [UserStatus.INACTIVE]: "Inativo",
  [UserStatus.SUSPENDED]: "Suspenso",
  [UserStatus.PENDING]: "Pendente",
};

export const FEED_AUDIENCE_LABELS: Record<FeedAudience, string> = {
  [FeedAudience.ALL]: "Todos",
  [FeedAudience.EMPLOYEES]: "Funcionários",
  [FeedAudience.PARTNERS]: "Parceiros",
};

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  [ProposalStatus.PENDING]: "Pendente",
  [ProposalStatus.ACCEPTED]: "Aceita",
  [ProposalStatus.REJECTED]: "Recusada",
  [ProposalStatus.EXPIRED]: "Expirada",
};
