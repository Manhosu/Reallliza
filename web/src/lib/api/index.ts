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
export { osProjectsApi } from "./os-projects";
export type { OsProject } from "./os-projects";
export { reportsApi } from "./reports";
export { auditApi } from "./audit";
export { feedApi } from "./feed";
export { ratingsApi } from "./ratings";
export { proposalsApi } from "./proposals";
export { trackingApi } from "./tracking";
export { consentApi } from "./consent";
export { stepTemplatesApi } from "./step-templates";
export { serviceCategoriesApi, servicesApi } from "./services";
export type {
  ServiceCategory,
  CreateServiceCategoryPayload,
  UpdateServiceCategoryPayload,
  Service,
  CreateServicePayload,
  UpdateServicePayload,
} from "./services";
export { regionsApi } from "./regions";
export type {
  Region,
  CreateRegionPayload,
  UpdateRegionPayload,
} from "./regions";
export { homologationApi } from "./homologation";
export type {
  HomologationRequest,
  HomologationStatus,
  HomologationProfile,
  RegisterProfessionalPayload,
} from "./homologation";
export { specialtiesApi } from "./specialties";
export type {
  Specialty,
  SpecialtyChecklistItem,
  CreateSpecialtyPayload,
  UpdateSpecialtyPayload,
  ChecklistItemPayload,
} from "./specialties";
export { qualityEvaluationsApi } from "./quality-evaluations";
export type {
  QualityEvaluation,
  QualityEvaluationScore,
  QualityScorePayload,
  CreateQualityEvaluationPayload,
} from "./quality-evaluations";
export { evaluationConfigApi, levelConfigApi } from "./evaluation";
export type {
  EvaluationWeights,
  LevelConfig,
  LevelConfigPayload,
} from "./evaluation";
export { quotesApi } from "./quotes";
export type {
  Quote,
  QuoteItem,
  QuotePayment,
  QuoteStatus,
  CreateQuotePayload,
  PayQuoteResult,
} from "./quotes";
export { messagesApi } from "./messages";
export type { OsMessage, OsWithLastMessage } from "./messages";
export type {
  StepTemplateGroup,
  StepTemplateItem,
  StepTemplateItemPayload,
  CreateStepTemplatePayload,
  UpdateStepTemplatePayload,
} from "./step-templates";

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
