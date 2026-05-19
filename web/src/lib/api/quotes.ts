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
  client_email: string | null;
  address_street: string | null;
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
  partner?: { id: string; company_name: string; user_id?: string } | null;
  items?: QuoteItem[];
  payments?: QuotePayment[];
}

export interface CreateQuotePayload {
  partner_id?: string;
  client_name: string;
  client_phone?: string;
  client_email?: string;
  address_street?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
  notes?: string;
  items: Array<{ service_id: string; quantity: number }>;
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
