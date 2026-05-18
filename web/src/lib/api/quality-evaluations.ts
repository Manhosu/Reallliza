import { apiClient } from "./client";

export interface QualityEvaluationScore {
  id: string;
  evaluation_id: string;
  checklist_item_id: string | null;
  item_label: string;
  weight: number;
  score: number;
}

export interface QualityEvaluation {
  id: string;
  service_order_id: string;
  technician_id: string;
  specialty_id: string | null;
  evaluator_id: string | null;
  score: number;
  needs_rework: boolean;
  notes: string | null;
  created_at: string;
  technician?: { id: string; full_name: string } | null;
  specialty?: { id: string; name: string } | null;
  service_order?: {
    id: string;
    order_number: number | string;
    client_name: string;
  } | null;
  scores?: QualityEvaluationScore[];
}

export interface QualityScorePayload {
  checklist_item_id?: string | null;
  item_label: string;
  weight: number;
  score: number;
}

export interface CreateQualityEvaluationPayload {
  service_order_id: string;
  technician_id: string;
  specialty_id?: string | null;
  needs_rework?: boolean;
  notes?: string;
  scores: QualityScorePayload[];
}

export const qualityEvaluationsApi = {
  list(params?: { technician_id?: string }) {
    return apiClient.get<QualityEvaluation[]>(
      "/quality-evaluations",
      params as Record<string, unknown>
    );
  },
  getById(id: string) {
    return apiClient.get<QualityEvaluation>(`/quality-evaluations/${id}`);
  },
  create(payload: CreateQualityEvaluationPayload) {
    return apiClient.post<QualityEvaluation>("/quality-evaluations", payload);
  },
};
