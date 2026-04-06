import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import {
  WebhookDispatcherService,
  WebhookPayload,
  WEBHOOK_MAX_ATTEMPTS,
} from './webhook-dispatcher.service';

@Injectable()
export class WebhookRetryService {
  private readonly logger = new Logger(WebhookRetryService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly dispatcher: WebhookDispatcherService,
  ) {}

  /**
   * Every 5 minutes, reprocess undelivered webhook_events whose next_attempt_at
   * is in the past and which still have attempts remaining.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async retryPending(): Promise<void> {
    const supabase = this.supabaseService.getClient();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('webhook_events')
      .select('id, callback_url, payload, attempt_count')
      .is('delivered_at', null)
      .lt('attempt_count', WEBHOOK_MAX_ATTEMPTS)
      .lte('next_attempt_at', now)
      .limit(50);

    if (error) {
      this.logger.error(`Webhook retry query failed: ${error.message}`);
      return;
    }

    if (!data || data.length === 0) return;

    this.logger.log(`Retrying ${data.length} pending webhook(s)`);

    for (const evt of data) {
      try {
        await this.dispatcher.attemptDelivery(
          evt.id,
          evt.callback_url,
          evt.payload as unknown as WebhookPayload,
          evt.attempt_count,
        );
      } catch (err) {
        this.logger.error(
          `Retry failed for webhook_event ${evt.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}
