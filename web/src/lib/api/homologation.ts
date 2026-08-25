import { apiClient } from "./client";
import type { PixKeyType } from "@/lib/types";

export type HomologationStatus =
  | "pending"
  | "under_review"
  | "approved"
  | "rejected";

export interface HomologationProfile {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  specialties: string[] | null;
  professional_type: string;
  is_homologated: boolean;
  pix_key: string | null;
  pix_key_type: PixKeyType | null;
}

export interface HomologationRequest {
  id: string;
  profile_id: string;
  status: HomologationStatus;
  documents: unknown;
  notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  profile: HomologationProfile | null;
}

export interface RegisterProfessionalPayload {
  full_name: string;
  email: string;
  password: string;
  phone?: string;
  cpf?: string;
  specialties?: string[];
  pix_key: string;
  pix_key_type: PixKeyType;
}

export const homologationApi = {
  list() {
    return apiClient.get<HomologationRequest[]>("/homologation");
  },
  /** Cadastro público — não requer autenticação. */
  register(payload: RegisterProfessionalPayload) {
    return apiClient.post<{ success: true }>("/homologation", payload);
  },
  decide(
    id: string,
    status: "under_review" | "approved" | "rejected",
    notes?: string
  ) {
    return apiClient.patch<{ success: true }>(`/homologation/${id}`, {
      status,
      notes,
    });
  },
};
