import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { ExternalController } from './external.controller';
import { ExternalService } from './external.service';
import { WebhookDispatcherService } from './webhook-dispatcher.service';
import { WebhookRetryService } from './webhook-retry.service';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

/**
 * System-to-system integration module.
 * - Controller: POST /api/external/service-orders (API-Key guarded)
 * - Dispatcher: fires signed webhooks to external_callback_url on status changes
 * - Retry: cron every 5 minutes reprocesses undelivered webhook_events
 *
 * SupabaseService and AuditService are globally available (no import needed).
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    HttpModule.register({
      timeout: 10_000,
      maxRedirects: 3,
    }),
  ],
  controllers: [ExternalController],
  providers: [
    ExternalService,
    WebhookDispatcherService,
    WebhookRetryService,
    ApiKeyGuard,
  ],
  exports: [WebhookDispatcherService],
})
export class ExternalModule {}
