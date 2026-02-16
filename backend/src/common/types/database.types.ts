// ============================================================
// Enums
// ============================================================

export enum UserRole {
  ADMIN = 'admin',
  TECHNICIAN = 'technician',
  PARTNER = 'partner',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
}

export enum OsStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  REJECTED = 'rejected',
}

export enum OsPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum PhotoType {
  BEFORE = 'before',
  DURING = 'during',
  AFTER = 'after',
  ISSUE = 'issue',
  SIGNATURE = 'signature',
}

export enum ToolStatus {
  AVAILABLE = 'available',
  IN_USE = 'in_use',
  MAINTENANCE = 'maintenance',
  RETIRED = 'retired',
}

export enum ToolCondition {
  NEW = 'new',
  GOOD = 'good',
  FAIR = 'fair',
  POOR = 'poor',
  DAMAGED = 'damaged',
}

export enum NotificationType {
  OS_CREATED = 'os_created',
  OS_ASSIGNED = 'os_assigned',
  OS_STATUS_CHANGED = 'os_status_changed',
  OS_COMPLETED = 'os_completed',
  OS_CANCELLED = 'os_cancelled',
  SCHEDULE_REMINDER = 'schedule_reminder',
  TOOL_CUSTODY = 'tool_custody',
  SYSTEM = 'system',
}

export enum ScheduleStatus {
  SCHEDULED = 'scheduled',
  CONFIRMED = 'confirmed',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  RESCHEDULED = 'rescheduled',
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
  version: number;
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
  version: number;
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

export interface DeviceToken {
  id: string;
  user_id: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
  created_at: string;
  updated_at: string;
}

export interface UserConsent {
  id: string;
  user_id: string;
  terms_accepted: boolean;
  privacy_accepted: boolean;
  marketing_accepted: boolean;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LgpdRequest {
  id: string;
  user_id: string;
  type: 'anonymization' | 'data_export';
  status: 'pending' | 'approved' | 'completed' | 'rejected';
  processed_by: string | null;
  processed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
