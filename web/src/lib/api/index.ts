export { apiClient, ApiError, buildQueryString } from "./client";
export { serviceOrdersApi } from "./service-orders";
export { usersApi } from "./users";
export { partnersApi } from "./partners";
export { toolsApi } from "./tools";
export { schedulesApi } from "./schedules";
export { notificationsApi } from "./notifications";
export { dashboardApi } from "./dashboard";
export { checklistTemplatesApi, checklistsApi } from "./checklists";
export { photosApi } from "./photos";
export { reportsApi } from "./reports";
export { auditApi } from "./audit";

// Re-export request/query payload types for convenience
export type {
  ListServiceOrdersParams,
  CreateServiceOrderPayload,
  UpdateServiceOrderPayload,
} from "./service-orders";

export type {
  ListUsersParams,
  UpdateUserPayload,
} from "./users";

export type {
  ListPartnersParams,
  CreatePartnerPayload,
  UpdatePartnerPayload,
} from "./partners";

export type {
  ListToolsParams,
  CreateToolPayload,
  UpdateToolPayload,
  CheckoutToolPayload,
  CheckinToolPayload,
} from "./tools";

export type {
  ListSchedulesParams,
  CreateSchedulePayload,
  UpdateSchedulePayload,
} from "./schedules";

export type {
  ListNotificationsParams,
  UnreadCountResponse,
} from "./notifications";

export type {
  DashboardStats,
  OsPerMonth,
} from "./dashboard";

export type {
  ListTemplatesParams,
  CreateTemplatePayload,
  UpdateTemplatePayload,
  CreateChecklistFromTemplatePayload,
} from "./checklists";

export type {
  UploadPhotoData,
  PhotoCountResponse,
} from "./photos";

export type {
  ListAuditLogsParams,
} from "./audit";
