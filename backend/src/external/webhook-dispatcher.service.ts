import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { createHmac } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from '../supabase/supabase.service';
import { OsStatus } from '../common/types/database.types';

/**
 * Backoff schedule (minutes) per attempt number (0-indexed):
 * attempt 0 -> immediate
 * attempt 1 -> +1min, 2 -> +5min, 3 -> +15min, 4 -> +1h, 5 -> +6h
 */
const BACKOFF_MINUTES = [0, 1, 5, 15, 60, 360];
export const WEBHOOK_MAX_ATTEMPTS = 5;

export interface WebhookServiceOrder {
  id: string;
  order_number: number | string;
  status: OsStatus;
  external_system: string | null;
  external_id: string | null;
  external_callback_url: string | null;
  technician_id?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  final_value?: number | null;
  [k: string]: unknown;
}

export interface WebhookPayload {
  event: string;
  external_system: string | null;
  external_id: string | null;
  enterprise_order_id: string;
  from_status: OsStatus | null;
  to_status: OsStatus;
  timestamp: string;
  data: Record<string, unknown>;
}

@Injectable()
export class WebhookDispatcherService {
  private readonly logger = new Logger(WebhookDispatcherService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Fire-and-forget. Creates a webhook_events row and attempts immediate delivery.
   * If delivery fails, the webhook-retry cron will reprocess it.
   */
  async dispatchStatusChange(
    order: WebhookServiceOrder,
    fromStatus: OsStatus | null,
    toStatus: OsStatus,
  ): Promise<void> {
    if (!order.external_callback_url) return;

    const eventType = this.pickEventType(toStatus);
    const data = await this.buildEventData(order, toStatus);

    const payload: WebhookPayload = {
      event: eventType,
      external_system: order.external_system,
      external_id: order.external_id,
      enterprise_order_id: order.id,
      from_status: fromStatus,
      to_status: toStatus,
      timestamp: new Date().toISOString(),
      data,
    };

    await this.saveAndDeliver(order.id, eventType, order.external_callback_url, payload);
  }

  /**
   * Dispatches a service_order.created event (used right after external creation).
   */
  async dispatchCreated(order: WebhookServiceOrder): Promise<void> {
    if (!order.external_callback_url) return;

    const payload: WebhookPayload = {
      event: 'service_order.created',
      external_system: order.external_system,
      external_id: order.external_id,
      enterprise_order_id: order.id,
      from_status: null,
      to_status: order.status,
      timestamp: new Date().toISOString(),
      data: {
        tracking_url: this.buildTrackingUrl(order.id),
      },
    };

    await this.saveAndDeliver(
      order.id,
      'service_order.created',
      order.external_callback_url,
      payload,
    );
  }

  private pickEventType(toStatus: OsStatus): string {
    if (toStatus === OsStatus.COMPLETED) return 'service_order.completed';
    if (toStatus === OsStatus.CANCELLED) return 'service_order.cancelled';
    if (toStatus === OsStatus.ASSIGNED) return 'service_order.assigned';
    return 'service_order.status_changed';
  }

  private async buildEventData(
    order: WebhookServiceOrder,
    toStatus: OsStatus,
  ): Promise<Record<string, unknown>> {
    const supabase = this.supabaseService.getClient();
    const data: Record<string, unknown> = {
      tracking_url: this.buildTrackingUrl(order.id),
    };

    // Technician info
    if (order.technician_id) {
      const { data: tech } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('id', order.technician_id)
        .maybeSingle();
      if (tech) {
        data.technician_id = tech.id;
        data.technician_name = tech.full_name;
      }
      data.started_at = order.started_at ?? null;
    }

    if (toStatus === OsStatus.COMPLETED) {
      data.completed_at = order.completed_at ?? null;
      data.final_value = order.final_value ?? null;

      // Photos
      const { data: photos } = await supabase
        .from('photos')
        .select('type, url, taken_at, created_at')
        .eq('service_order_id', order.id)
        .order('created_at', { ascending: true });
      data.photos = (photos || []).map((p) => ({
        type: p.type,
        url: p.url,
        captured_at: p.taken_at || p.created_at,
      }));

      // Checklist summary (latest checklist)
      const { data: checklist } = await supabase
        .from('checklists')
        .select('items, completed_at')
        .eq('service_order_id', order.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (checklist) {
        const items = (checklist.items as Array<{ checked: boolean }> | null) || [];
        data.checklist_summary = {
          completed: !!checklist.completed_at,
          items_ok: items.filter((i) => i.checked).length,
          items_total: items.length,
        };
      }
    }

    if (toStatus === OsStatus.CANCELLED) {
      // Pull latest status history note as cancellation reason
      const { data: hist } = await supabase
        .from('os_status_history')
        .select('notes')
        .eq('service_order_id', order.id)
        .eq('to_status', OsStatus.CANCELLED)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      data.cancellation_reason = hist?.notes ?? null;
    }

    return data;
  }

  private buildTrackingUrl(orderId: string): string {
    const base =
      this.configService.get<string>('WEB_BASE_URL') ||
      'http://localhost:3000';
    return `${base.replace(/\/$/, '')}/service-orders/${orderId}`;
  }

  /**
   * Inserts a webhook_events row, then attempts immediate delivery.
   * Never throws — errors are swallowed (fire-and-forget).
   */
  private async saveAndDeliver(
    serviceOrderId: string,
    eventType: string,
    callbackUrl: string,
    payload: WebhookPayload,
  ): Promise<void> {
    const supabase = this.supabaseService.getClient();

    const { data: row, error: insertErr } = await supabase
      .from('webhook_events')
      .insert({
        service_order_id: serviceOrderId,
        event_type: eventType,
        callback_url: callbackUrl,
        payload: payload as unknown as Record<string, unknown>,
        attempt_count: 0,
        next_attempt_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertErr || !row) {
      this.logger.error(
        `Failed to persist webhook_event: ${insertErr?.message || 'unknown'}`,
      );
      return;
    }

    // Attempt immediate delivery (don't block)
    this.attemptDelivery(row.id, callbackUrl, payload, 0).catch((err) => {
      this.logger.error(
        `Initial webhook delivery failed for ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  /**
   * Attempts to POST the payload to callbackUrl. Updates webhook_events with
   * status/response. Called both on initial dispatch and by the retry cron.
   */
  async attemptDelivery(
    eventId: string,
    callbackUrl: string,
    payload: WebhookPayload,
    currentAttemptCount: number,
  ): Promise<boolean> {
    const supabase = this.supabaseService.getClient();
    const body = JSON.stringify(payload);
    const signature = this.sign(body);

    const nextAttempt = currentAttemptCount + 1;

    try {
      const response = await firstValueFrom(
        this.httpService.post(callbackUrl, body, {
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': `sha256=${signature}`,
            'X-Webhook-Event': payload.event,
            'User-Agent': 'Reallliza-Enterprise-Webhook/1.0',
          },
          timeout: 10_000,
          validateStatus: () => true,
        }),
      );

      const success = response.status >= 200 && response.status < 300;
      const responseText =
        typeof response.data === 'string'
          ? response.data.slice(0, 2000)
          : JSON.stringify(response.data || '').slice(0, 2000);

      await supabase
        .from('webhook_events')
        .update({
          attempt_count: nextAttempt,
          http_status: response.status,
          response_body: responseText,
          error_message: success ? null : `HTTP ${response.status}`,
          delivered_at: success ? new Date().toISOString() : null,
          next_attempt_at: success
            ? null
            : this.computeNextAttempt(nextAttempt),
        })
        .eq('id', eventId);

      return success;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabase
        .from('webhook_events')
        .update({
          attempt_count: nextAttempt,
          error_message: msg.slice(0, 1000),
          next_attempt_at: this.computeNextAttempt(nextAttempt),
        })
        .eq('id', eventId);
      return false;
    }
  }

  private computeNextAttempt(attemptCount: number): string | null {
    if (attemptCount >= WEBHOOK_MAX_ATTEMPTS) return null;
    const minutes = BACKOFF_MINUTES[attemptCount] ?? 360;
    return new Date(Date.now() + minutes * 60_000).toISOString();
  }

  private sign(body: string): string {
    const secret =
      this.configService.get<string>('WEBHOOK_SIGNING_SECRET') || '';
    if (!secret) {
      this.logger.warn(
        'WEBHOOK_SIGNING_SECRET not set — webhook signatures will be empty/weak',
      );
    }
    return createHmac('sha256', secret).update(body).digest('hex');
  }
}
