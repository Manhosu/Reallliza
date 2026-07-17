import { apiClient } from "./client";

export type QuoteStatus =
  | "draft"
  | "awaiting_payment"
  | "paid"
  | "converted"
  | "cancelled";

export interface QuoteItem {
  id: string;
  quote_id: string;
  service_id: string | null;
  service_name: string;
  unit: string | null;
  unit_price: number;
  quantity: number;
  created_at: string;
}

export interface QuotePayment {
  id: string;
  status: string;
  method: string | null;
  amount: number;
  checkout_url: string | null;
  created_at: string;
  paid_at: string | null;
}

export interface Quote {
  id: string;
  quote_number: number;
  partner_id: string;
  status: QuoteStatus;
  client_name: string;
  client_phone: string | null;
  client_whatsapp: string | null;
  client_email: string | null;
  client_document: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  notes: string | null;
  total_amount: number;
  created_by: string | null;
  service_order_id: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  // Fase 2 — modalidade + calculo
  modality: QuoteModality | null;
  service_date: string | null;
  service_time: string | null;
  travel_distance_km: number | null;
  travel_cost: number | null;
  stay_count: number | null;
  stay_cost: number | null;
  is_special_hour: boolean | null;
  special_hour_extra: number | null;
  subtotal_services: number | null;
  total_hours: number | null;
  total_days: number | null;
  platform_fee_pct: number | null;
  platform_fee_amount: number | null;
  payout_amount: number | null;
  region_city: string | null;
  region_state: string | null;
  custody_held: boolean | null;
  // Novos campos pro PDF layout Jessica 10/07 — loja preenche no form
  service_type?: string | null;
  total_area_m2?: number | null;
  rooms?: string | null;
  technical_responsible?: string | null;
  technicians_count?: number | null;
  material_description?: string | null;
  warranty_months?: number | null;
  execution_start_date?: string | null;
  scope_items?: string[] | null;
  important_notes?: string | null;
  general_notes?: string | null;
  partner?: { id: string; company_name: string; user_id?: string } | null;
  items?: QuoteItem[];
  payments?: QuotePayment[];
}

export type QuoteModality = "reallliza" | "homologados";

export interface CreateQuotePayload {
  partner_id?: string;
  client_name: string;
  client_phone?: string;
  client_whatsapp?: string;
  client_email?: string;
  client_document?: string;
  address_street?: string;
  address_number?: string;
  address_complement?: string;
  address_neighborhood?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
  notes?: string;
  items: Array<{ service_id: string; quantity: number }>;
  modality?: QuoteModality;
  service_date?: string;
  service_time?: string;
  region_city?: string;
  region_state?: string;
  manual_total_amount?: number;
  // Novos campos PDF Jessica 10/07
  service_type?: string;
  total_area_m2?: number;
  rooms?: string;
  technical_responsible?: string;
  technicians_count?: number;
  material_description?: string;
  warranty_months?: number;
  execution_start_date?: string;
  scope_items?: string[];
  important_notes?: string;
  general_notes?: string;
  // Anexos Jessica 16/07
  project_files?: Array<{ url: string; name: string; storage_path: string }>;
  material_files?: Array<{ url: string; name: string; storage_path: string }>;
}

export interface PayQuoteResult {
  payment_id: string;
  checkout_url: string | null;
  manual?: boolean;
}

export const quotesApi = {
  list() {
    return apiClient.get<Quote[]>("/quotes");
  },
  getById(id: string) {
    return apiClient.get<Quote>(`/quotes/${id}`);
  },
  create(payload: CreateQuotePayload) {
    return apiClient.post<Quote>("/quotes", payload);
  },
  pay(id: string) {
    return apiClient.post<PayQuoteResult>(`/quotes/${id}/pay`, {});
  },
  confirmPayment(id: string) {
    return apiClient.post<{ success: true }>(
      `/quotes/${id}/confirm-payment`,
      {}
    );
  },
};
