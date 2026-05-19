import { apiClient } from "./client";

export interface EvaluationWeights {
  id: string;
  weight_system: number;
  weight_client: number;
  weight_quality: number;
  updated_at: string;
}

export interface LevelConfig {
  id: string;
  level: "bronze" | "prata" | "ouro";
  label: string;
  order_index: number;
  min_overall_score: number;
  min_specialties: number;
  min_certifications: number;
  min_days_active: number;
  requires_certification: boolean;
  updated_at: string;
}

export interface LevelConfigPayload {
  level: string;
  min_overall_score?: number;
  min_specialties?: number;
  min_certifications?: number;
  min_days_active?: number;
  requires_certification?: boolean;
}

export const evaluationConfigApi = {
  get() {
    return apiClient.get<EvaluationWeights>("/evaluation-config");
  },
  update(payload: {
    weight_system: number;
    weight_client: number;
    weight_quality: number;
  }) {
    return apiClient.patch<EvaluationWeights>("/evaluation-config", payload);
  },
};

export const levelConfigApi = {
  list() {
    return apiClient.get<LevelConfig[]>("/level-config");
  },
  update(levels: LevelConfigPayload[]) {
    return apiClient.patch<LevelConfig[]>("/level-config", { levels });
  },
};
