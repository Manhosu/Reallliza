import { NextRequest } from "next/server";
import {
  authenticateApiKey,
  ApiKeyError,
} from "@/lib/api-helpers/api-key-auth";
import { jsonResponse } from "@/lib/api-helpers/response";
import { retryPendingWebhooks } from "@/lib/api-helpers/webhook-dispatcher";

export const maxDuration = 60;

/**
 * Retenta webhooks pendentes (delivered_at IS NULL, attempt_count < 5).
 *
 * Aceita 3 formas de autenticação:
 *  - X-API-Key header (compatibilidade com chamadas externas autenticadas)
 *  - Authorization: Bearer ${CRON_SECRET} (Vercel Cron — env var deve existir)
 *  - Header `x-vercel-cron` presente (cron jobs do Vercel sempre incluem)
 */
async function authorize(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization") || "";
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return;

  if (request.headers.get("x-vercel-cron")) return;

  await authenticateApiKey(request);
}

async function handle(request: NextRequest) {
  try {
    await authorize(request);

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

export const GET = handle;
export const POST = handle;
