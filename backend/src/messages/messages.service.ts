import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../common/types/database.types';
import { WebhookDispatcherService } from '../external/webhook-dispatcher.service';

interface OsMessage {
  id: string;
  service_order_id: string;
  sender_user_id: string | null;
  sender_role: string;
  sender_name: string;
  content: string;
  attachment_url: string | null;
  attachment_type: string | null;
  read_at: string | null;
  external_message_id: string | null;
  created_at: string;
}

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly webhookDispatcher: WebhookDispatcherService,
  ) {}

  /**
   * Lista mensagens de uma OS em ordem cronológica.
   */
  async listMessages(serviceOrderId: string, userId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: order, error: orderError } = await supabase
      .from('service_orders')
      .select('id, technician_id, partner_id')
      .eq('id', serviceOrderId)
      .single();

    if (orderError || !order) {
      throw new NotFoundException('Service order not found');
    }

    const { data, error } = await supabase
      .from('os_messages')
      .select('*')
      .eq('service_order_id', serviceOrderId)
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error(`Failed to list messages: ${error.message}`);
      throw new InternalServerErrorException('Erro ao listar mensagens');
    }

    // Marca como lidas todas que não foram enviadas pelo próprio user
    const unread = (data || []).filter(
      (m) => !m.read_at && m.sender_user_id !== userId,
    );
    if (unread.length > 0) {
      await supabase
        .from('os_messages')
        .update({ read_at: new Date().toISOString() })
        .in(
          'id',
          unread.map((m) => m.id),
        );
    }

    return (data || []) as OsMessage[];
  }

  /**
   * Cria mensagem do técnico ou admin.
   */
  async createMessage(
    serviceOrderId: string,
    userId: string,
    senderRole: string,
    senderName: string,
    payload: {
      content: string;
      attachment_url?: string;
      attachment_type?: string;
      external_message_id?: string;
    },
  ) {
    const supabase = this.supabaseService.getClient();

    const { data: order, error: orderError } = await supabase
      .from('service_orders')
      .select(
        'id, order_number, status, technician_id, partner_id, external_callback_url, external_system, external_id',
      )
      .eq('id', serviceOrderId)
      .single();

    if (orderError || !order) {
      throw new NotFoundException('Service order not found');
    }

    // Permissões: técnico deve estar atribuído; outros papéis (admin) já validados pelo RolesGuard.
    if (senderRole === 'technician' && order.technician_id !== userId) {
      throw new ForbiddenException('Você não está atribuído a esta OS');
    }

    const { data: msg, error } = await supabase
      .from('os_messages')
      .insert({
        service_order_id: serviceOrderId,
        sender_user_id: userId,
        sender_role: senderRole,
        sender_name: senderName,
        content: payload.content,
        attachment_url: payload.attachment_url || null,
        attachment_type: payload.attachment_type || null,
        external_message_id: payload.external_message_id || null,
      })
      .select()
      .single();

    if (error || !msg) {
      this.logger.error(`Failed to create message: ${error?.message}`);
      throw new InternalServerErrorException('Erro ao enviar mensagem');
    }

    this.auditService.log({
      userId,
      action: 'os_message.sent',
      entityType: 'os_message',
      entityId: msg.id,
      newData: { service_order_id: serviceOrderId, sender_role: senderRole },
    });

    // Push notification para a contraparte
    if (senderRole === 'technician') {
      // Dispatch webhook para o sistema externo (Garantias) — fire-and-forget
      if (order.external_callback_url) {
        this.webhookDispatcher
          .dispatchTechnicianMessage(order as never, {
            id: msg.id,
            sender_user_id: msg.sender_user_id,
            sender_role: msg.sender_role,
            sender_name: msg.sender_name,
            content: msg.content,
            attachment_url: msg.attachment_url,
            attachment_type: msg.attachment_type,
            created_at: msg.created_at,
          })
          .catch((err) =>
            this.logger.error(
              `Failed to dispatch technician message webhook: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
      }
    } else if (order.technician_id) {
      try {
        await this.notificationsService.create(
          order.technician_id,
          `Nova mensagem na OS #${order.order_number}`,
          payload.content.slice(0, 120),
          NotificationType.SYSTEM,
          { service_order_id: serviceOrderId, message_id: msg.id, type: 'message' },
        );
      } catch {
        // não bloqueia
      }
    }

    return msg as OsMessage;
  }

  /**
   * Webhook: recebe mensagem vinda do Garantias (operador → técnico).
   */
  async ingestExternalMessage(payload: {
    service_order_id: string;
    external_message_id: string;
    sender_role: string;
    sender_name: string;
    content: string;
    attachment_url?: string;
    attachment_type?: string;
  }) {
    const supabase = this.supabaseService.getClient();

    // Idempotência: se já temos a mensagem, retorna ela
    const { data: existing } = await supabase
      .from('os_messages')
      .select('*')
      .eq('external_message_id', payload.external_message_id)
      .maybeSingle();

    if (existing) return existing as OsMessage;

    const { data: order } = await supabase
      .from('service_orders')
      .select('id, order_number, technician_id')
      .eq('id', payload.service_order_id)
      .single();

    if (!order) {
      throw new NotFoundException('Service order not found');
    }

    const { data: msg, error } = await supabase
      .from('os_messages')
      .insert({
        service_order_id: payload.service_order_id,
        sender_user_id: null,
        sender_role: payload.sender_role,
        sender_name: payload.sender_name,
        content: payload.content,
        attachment_url: payload.attachment_url || null,
        attachment_type: payload.attachment_type || null,
        external_message_id: payload.external_message_id,
      })
      .select()
      .single();

    if (error || !msg) {
      throw new InternalServerErrorException('Erro ao receber mensagem externa');
    }

    // Push para o técnico
    if (order.technician_id) {
      try {
        await this.notificationsService.create(
          order.technician_id,
          `Nova mensagem na OS #${order.order_number}`,
          payload.content.slice(0, 120),
          NotificationType.SYSTEM,
          { service_order_id: payload.service_order_id, message_id: msg.id, type: 'message' },
        );
      } catch {
        // não bloqueia
      }
    }

    return msg as OsMessage;
  }
}
