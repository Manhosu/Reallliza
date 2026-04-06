import { NextRequest } from "next/server";
import {
  authenticateApiKey,
  ApiKeyError,
} from "@/lib/api-helpers/api-key-auth";
import { jsonResponse } from "@/lib/api-helpers/response";
import { retryPendingWebhooks } from "@/lib/api-helpers/webhook-dispatcher";

/**
 * POST /api/external/webhooks/retry
 * Retenta webhooks pendentes (delivered_at IS NULL, attempt_count < 5).
 * Autenticação via X-API-Key header.
 */
export async function POST(request: NextRequest) {
  try {
    await authenticateApiKey(request);

    const result = await retryPendingWebhooks();

    return jsonResponse({
      message: "Webhook retry completed",
      ...result,
    });
  } catch (error) {
    if (error instanceof ApiKeyError) {
      return jsonResponse({ message: error.message }, error.status);
    }
    if (error instanceof Error) {
      console.error(`Webhook retry error: ${error.message}`);
      return jsonResponse({ message: error.message }, 500);
    }
    return jsonResponse({ message: "Internal server error" }, 500);
  }
}
