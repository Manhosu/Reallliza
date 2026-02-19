import { apiClient } from "./client";
import type { UserConsent } from "@/lib/types";

// ============================================================
// API calls
// ============================================================

export const consentApi = {
  getStatus() {
    return apiClient.get<{ has_accepted: boolean; consent: UserConsent | null }>(
      "/auth/consent-status"
    );
  },

  acceptTerms(data: {
    location_consent: boolean;
    image_consent: boolean;
    terms_version?: string;
  }) {
    return apiClient.post("/auth/accept-terms", data);
  },
};
