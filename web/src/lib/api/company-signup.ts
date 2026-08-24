import { apiClient } from "./client";

export type CompanySignupStatus = "pending" | "approved" | "rejected";
export type CompanyType = "loja" | "fabricante";

export interface CompanySignupProfile {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
}

export interface CompanySignupRequest {
  id: string;
  profile_id: string;
  company_type: CompanyType;
  company_name: string;
  cnpj: string;
  city_name: string | null;
  uf: string | null;
  status: CompanySignupStatus;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  profile: CompanySignupProfile | null;
}

export interface RegisterCompanyPayload {
  company_type: CompanyType;
  company_name: string;
  cnpj: string;
  contact_name: string;
  contact_phone: string;
  email: string;
  password: string;
  city?: string;
  uf?: string;
}

export const companySignupApi = {
  list() {
    return apiClient.get<CompanySignupRequest[]>("/company-signup");
  },
  /** Cadastro público — não requer autenticação. */
  register(payload: RegisterCompanyPayload) {
    return apiClient.post<{ success: true }>("/company-signup", payload);
  },
  decide(id: string, status: "approved" | "rejected", reason?: string) {
    return apiClient.patch<{ success: true }>(`/company-signup/${id}`, {
      status,
      reason,
    });
  },
};
