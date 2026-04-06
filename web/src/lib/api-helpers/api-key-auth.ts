import { NextRequest } from "next/server";
import { getAdminClient } from "./supabase-admin";
import { createHash } from "crypto";

export interface ApiKeyAuth {
  system_identifier: string;
  api_key_id: string;
}

export class ApiKeyError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiKeyError";
    this.status = status;
  }
}

/**
 * Valida X-API-Key header contra tabela api_keys.
 * Hash SHA-256 comparado com key_hash no banco.
 * Atualiza last_used_at.
 */
export async function authenticateApiKey(
  request: NextRequest
): Promise<ApiKeyAuth> {
  const apiKey = request.headers.get("x-api-key");

  if (!apiKey) {
    throw new ApiKeyError(401, "X-API-Key header is missing");
  }

  const keyHash = createHash("sha256").update(apiKey).digest("hex");
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, system_identifier, is_active, revoked_at")
    .eq("key_hash", keyHash)
    .single();

  if (error || !data) {
    throw new ApiKeyError(401, "Invalid API key");
  }

  if (!data.is_active || data.revoked_at) {
    throw new ApiKeyError(401, "API key has been revoked");
  }

  // Atualizar last_used_at (fire-and-forget)
  supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {});

  return {
    system_identifier: data.system_identifier,
    api_key_id: data.id,
  };
}
