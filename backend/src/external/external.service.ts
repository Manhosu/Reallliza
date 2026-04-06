import {
  Injectable,
  Logger,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditService } from '../audit/audit.service';
import { OsStatus } from '../common/types/database.types';
import { CreateExternalOsDto } from './dto';
import { WebhookDispatcherService } from './webhook-dispatcher.service';

@Injectable()
export class ExternalService {
  private readonly logger = new Logger(ExternalService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly webhookDispatcher: WebhookDispatcherService,
  ) {}

  /**
   * Creates a ServiceOrder from an external system (e.g. Garantias).
   * Enforces cross-system isolation (dto.external_system must match the API key).
   * Idempotent via UNIQUE(external_system, external_id).
   */
  async createFromExternal(dto: CreateExternalOsDto, apiKeySystem: string) {
    // Cross-system isolation: an API key for GARANTIAS cannot create OSs as another system
    if (dto.external_system !== apiKeySystem) {
      throw new ForbiddenException(
        `API key is scoped to system '${apiKeySystem}' but payload targets '${dto.external_system}'`,
      );
    }

    const supabase = this.supabaseService.getClient();

    // Idempotency check
    const { data: existing } = await supabase
      .from('service_orders')
      .select('id, order_number, status, created_at')
      .eq('external_system', dto.external_system)
      .eq('external_id', dto.external_id)
      .maybeSingle();

    if (existing) {
      throw new ConflictException({
        message: 'Service order already exists for this external_id',
        existing: {
          id: existing.id,
          order_number: existing.order_number,
          status: existing.status,
          created_at: existing.created_at,
          tracking_url: this.buildTrackingUrl(existing.id),
        },
      });
    }

    const systemUserId = this.resolveSystemUserId();

    const insertData: Record<string, unknown> = {
      title: dto.title,
      status: OsStatus.PENDING,
      created_by: systemUserId,
      client_name: dto.client_name,
      external_system: dto.external_system,
      external_id: dto.external_id,
      external_callback_url: dto.external_callback_url,
      external_metadata: dto.external_metadata || {},
    };

    if (dto.description) insertData.description = dto.description;
    if (dto.priority) insertData.priority = dto.priority;
    if (dto.client_phone) insertData.client_phone = dto.client_phone;
    if (dto.client_email) insertData.client_email = dto.client_email;
    if (dto.client_document) insertData.client_document = dto.client_document;
    if (dto.address_street) insertData.address_street = dto.address_street;
    if (dto.address_number) insertData.address_number = dto.address_number;
    if (dto.address_complement)
      insertData.address_complement = dto.address_complement;
    if (dto.address_neighborhood)
      insertData.address_neighborhood = dto.address_neighborhood;
    if (dto.address_city) insertData.address_city = dto.address_city;
    if (dto.address_state) insertData.address_state = dto.address_state;
    if (dto.address_zip) insertData.address_zip = dto.address_zip;
    if (dto.geo_lat !== undefined) insertData.geo_lat = dto.geo_lat;
    if (dto.geo_lng !== undefined) insertData.geo_lng = dto.geo_lng;
    if (dto.estimated_value !== undefined)
      insertData.estimated_value = dto.estimated_value;
    if (dto.notes) insertData.notes = dto.notes;

    const { data: order, error } = await supabase
      .from('service_orders')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      // Race condition: unique index tripped between check and insert
      if (error.code === '23505') {
        throw new ConflictException(
          'Service order already exists for this external_id',
        );
      }
      this.logger.error(
        `Failed to create external service order: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to create service order',
      );
    }

    // Initial status history
    await supabase.from('os_status_history').insert({
      service_order_id: order.id,
      from_status: null,
      to_status: OsStatus.PENDING,
      changed_by: systemUserId,
      notes: `Criada via integração ${dto.external_system} (${dto.external_id})`,
    });

    // Audit log
    this.auditService.log({
      userId: systemUserId,
      action: 'service_order.created_external',
      entityType: 'service_order',
      entityId: order.id,
      newData: {
        external_system: dto.external_system,
        external_id: dto.external_id,
        order_number: order.order_number,
      },
    });

    // Fire created webhook (fire-and-forget)
    this.webhookDispatcher.dispatchCreated(order).catch((err) => {
      this.logger.error(
        `Failed to dispatch created webhook for ${order.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return {
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      tracking_url: this.buildTrackingUrl(order.id),
      created_at: order.created_at,
    };
  }

  async findByExternalId(externalSystem: string, externalId: string) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('service_orders')
      .select(
        'id, order_number, status, external_system, external_id, created_at, updated_at, started_at, completed_at, technician_id, final_value',
      )
      .eq('external_system', externalSystem)
      .eq('external_id', externalId)
      .maybeSingle();

    if (error) {
      this.logger.error(`findByExternalId failed: ${error.message}`);
      throw new InternalServerErrorException('Query failed');
    }

    if (!data) {
      throw new NotFoundException(
        `No service order for ${externalSystem}/${externalId}`,
      );
    }

    return {
      ...data,
      tracking_url: this.buildTrackingUrl(data.id),
    };
  }

  private buildTrackingUrl(id: string): string {
    const base =
      this.configService.get<string>('WEB_BASE_URL') ||
      'http://localhost:3000';
    return `${base.replace(/\/$/, '')}/service-orders/${id}`;
  }

  private resolveSystemUserId(): string {
    const id = this.configService.get<string>('EXTERNAL_INTEGRATION_USER_ID');
    if (!id) {
      throw new InternalServerErrorException(
        'EXTERNAL_INTEGRATION_USER_ID not configured — cannot attribute created_by',
      );
    }
    return id;
  }
}
