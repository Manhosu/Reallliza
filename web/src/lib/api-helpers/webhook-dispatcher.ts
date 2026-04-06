import { getAdminClient } from "./supabase-admin";
import { createHmac } from "crypto";

const WEBHOOK_SECRET = process.env.WEBHOOK_SIGNING_SECRET || "";

/**
 * Dispara webhook para sistema externo quando status da OS muda.
 * Grava em webhook_events e tenta entregar.
 * Fire-and-forget — não bloqueia a resposta do endpoint.
 */
export async function dispatchWebhook(
  serviceOrderId: string,
  eventType: string,
  extraPayload: Record<string, unknown> = {}
): Promise<void> {
  const supabase = getAdminClient();

  // Buscar callback_url e dados da OS
  const { data: order } = await supabase
    .from("service_orders")
    .select(
      "external_callback_url, external_system, external_id"
    )
    .eq("id", serviceOrderId)
    .single();

  if (!order?.external_callback_url) return;

  const fullPayload = {
    event: eventType,
    external_system: order.external_system,
    external_id: order.external_id,
    enterprise_order_id: serviceOrderId,
    timestamp: new Date().toISOString(),
    ...extraPayload,
  };

  const payloadJson = JSON.stringify(fullPayload);

  // HMAC signature
  const signature = WEBHOOK_SECRET
    ? createHmac("sha256", WEBHOOK_SECRET).update(payloadJson).digest("hex")
    : "";

  // Gravar evento no banco
  const { data: event } = await supabase
    .from("webhook_events")
    .insert({
      service_order_id: serviceOrderId,
      event_type: eventType,
      callback_url: order.external_callback_url,
      payload: fullPayload,
      attempt_count: 1,
      next_attempt_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  // Tentar entregar
  try {
    const response = await fetch(order.external_callback_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": `sha256=${signature}`,
        "X-Webhook-Event": eventType,
      },
      body: payloadJson,
      signal: AbortSignal.timeout(10000),
    });

    const responseBody = await response.text().catch(() => "");

    if (event?.id) {
      await supabase
        .from("webhook_events")
        .update({
          http_status: response.status,
          response_body: responseBody.slice(0, 2000),
          delivered_at: response.ok ? new Date().toISOString() : null,
          error_message: response.ok ? null : `HTTP ${response.status}`,
          next_attempt_at: response.ok
            ? null
            : new Date(Date.now() + 60_000).toISOString(),
        })
        .eq("id", event.id);
    }
  } catch (err) {
    if (event?.id) {
      await supabase
        .from("webhook_events")
        .update({
          error_message:
            err instanceof Error ? err.message : "Unknown error",
          next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
        })
        .eq("id", event.id);
    }
  }
}

/**
 * Retenta webhooks pendentes (delivered_at IS NULL, attempt_count < maxAttempts).
 * Backoff exponencial: 1min, 5min, 15min, 1h, 6h.
 */
export async function retryPendingWebhooks(
  maxAttempts: number = 5
): Promise<{ retried: number; delivered: number; failed: number }> {
  const supabase = getAdminClient();
  const now = new Date().toISOString();

  const { data: pendingEvents } = await supabase
    .from("webhook_events")
    .select("*")
    .is("delivered_at", null)
    .lt("attempt_count", maxAttempts)
    .lte("next_attempt_at", now)
    .order("created_at", { ascending: true })
    .limit(50);

  if (!pendingEvents || pendingEvents.length === 0) {
    return { retried: 0, delivered: 0, failed: 0 };
  }

  const backoffMinutes = [1, 5, 15, 60, 360];
  let delivered = 0;
  let failed = 0;

  for (const event of pendingEvents) {
    const payloadJson = JSON.stringify(event.payload);
    const signature = WEBHOOK_SECRET
      ? createHmac("sha256", WEBHOOK_SECRET)
          .update(payloadJson)
          .digest("hex")
      : "";

    const newAttemptCount = event.attempt_count + 1;

    try {
      const response = await fetch(event.callback_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": `sha256=${signature}`,
          "X-Webhook-Event": event.event_type,
        },
        body: payloadJson,
        signal: AbortSignal.timeout(10000),
      });

      const responseBody = await response.text().catch(() => "");

      if (response.ok) {
        delivered++;
        await supabase
          .from("webhook_events")
          .update({
            attempt_count: newAttemptCount,
            http_status: response.status,
            response_body: responseBody.slice(0, 2000),
            delivered_at: new Date().toISOString(),
            error_message: null,
            next_attempt_at: null,
          })
          .eq("id", event.id);
      } else {
        failed++;
        const nextBackoff =
          backoffMinutes[Math.min(newAttemptCount - 1, backoffMinutes.length - 1)];
        await supabase
          .from("webhook_events")
          .update({
            attempt_count: newAttemptCount,
            http_status: response.status,
            response_body: responseBody.slice(0, 2000),
            error_message: `HTTP ${response.status}`,
            next_attempt_at:
              newAttemptCount >= maxAttempts
                ? null
                : new Date(Date.now() + nextBackoff * 60_000).toISOString(),
          })
          .eq("id", event.id);
      }
    } catch (err) {
      failed++;
      const nextBackoff =
        backoffMinutes[Math.min(newAttemptCount - 1, backoffMinutes.length - 1)];
      await supabase
        .from("webhook_events")
        .update({
          attempt_count: newAttemptCount,
          error_message:
            err instanceof Error ? err.message : "Unknown error",
          next_attempt_at:
            newAttemptCount >= maxAttempts
              ? null
              : new Date(Date.now() + nextBackoff * 60_000).toISOString(),
        })
        .eq("id", event.id);
    }
  }

  return { retried: pendingEvents.length, delivered, failed };
}
