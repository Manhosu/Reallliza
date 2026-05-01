import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '../../common/types/database.types';

type ToolRequestStatus =
  | 'pending'
  | 'approved'
  | 'released'
  | 'rejected'
  | 'cancelled';

@Injectable()
export class ToolRequestsService {
  private readonly logger = new Logger(ToolRequestsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(
    requesterId: string,
    payload: {
      tool_id?: string;
      tool_name: string;
      quantity: number;
      justification?: string;
    },
  ) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('tool_requests')
      .insert({
        requester_id: requesterId,
        tool_id: payload.tool_id || null,
        tool_name: payload.tool_name,
        quantity: payload.quantity,
        justification: payload.justification || null,
        status: 'pending',
      })
      .select()
      .single();

    if (error || !data) {
      this.logger.error(`Failed to create tool request: ${error?.message}`);
      throw new InternalServerErrorException('Erro ao solicitar ferramenta');
    }

    this.auditService.log({
      userId: requesterId,
      action: 'tool_request.created',
      entityType: 'tool_request',
      entityId: data.id,
      newData: { tool_name: data.tool_name, quantity: data.quantity },
    });

    return data;
  }

  async listMine(userId: string, status?: ToolRequestStatus) {
    const supabase = this.supabaseService.getClient();
    let q = supabase
      .from('tool_requests')
      .select('*')
      .eq('requester_id', userId)
      .order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw new InternalServerErrorException(error.message);
    return data || [];
  }

  async listAll(status?: ToolRequestStatus) {
    const supabase = this.supabaseService.getClient();
    let q = supabase
      .from('tool_requests')
      .select('*, requester:profiles!requester_id(full_name)')
      .order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw new InternalServerErrorException(error.message);
    return data || [];
  }

  private async transition(
    requestId: string,
    expectedFromStatus: ToolRequestStatus[],
    update: Record<string, unknown>,
    userId: string,
    action: string,
  ) {
    const supabase = this.supabaseService.getClient();
    const { data: current, error: findErr } = await supabase
      .from('tool_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (findErr || !current) {
      throw new NotFoundException('Solicitação não encontrada');
    }
    if (!expectedFromStatus.includes(current.status as ToolRequestStatus)) {
      throw new BadRequestException(
        `Status atual (${current.status}) não permite essa transição`,
      );
    }

    const { data: updated, error } = await supabase
      .from('tool_requests')
      .update(update)
      .eq('id', requestId)
      .select()
      .single();

    if (error || !updated) {
      throw new InternalServerErrorException('Erro ao atualizar solicitação');
    }

    this.auditService.log({
      userId,
      action: `tool_request.${action}`,
      entityType: 'tool_request',
      entityId: requestId,
      oldData: { status: current.status },
      newData: { status: updated.status },
    });

    // Notificar o solicitante
    try {
      await this.notificationsService.create(
        current.requester_id,
        `Solicitação de ferramenta`,
        `Sua solicitação para "${current.tool_name}" foi ${labelOf(updated.status as ToolRequestStatus)}.`,
        NotificationType.TOOL_CUSTODY,
        { tool_request_id: requestId, status: updated.status },
      );
    } catch {
      // não bloqueia
    }

    return updated;
  }

  async approve(requestId: string, userId: string) {
    return this.transition(
      requestId,
      ['pending'],
      {
        status: 'approved',
        approved_by: userId,
        approved_at: new Date().toISOString(),
      },
      userId,
      'approved',
    );
  }

  async reject(requestId: string, userId: string, reason?: string) {
    return this.transition(
      requestId,
      ['pending', 'approved'],
      {
        status: 'rejected',
        rejected_by: userId,
        rejected_at: new Date().toISOString(),
        rejection_reason: reason || null,
      },
      userId,
      'rejected',
    );
  }

  async release(requestId: string, userId: string) {
    return this.transition(
      requestId,
      ['approved'],
      {
        status: 'released',
        released_by: userId,
        released_at: new Date().toISOString(),
      },
      userId,
      'released',
    );
  }

  async cancel(requestId: string, userId: string) {
    return this.transition(
      requestId,
      ['pending'],
      {
        status: 'cancelled',
      },
      userId,
      'cancelled',
    );
  }
}

function labelOf(status: ToolRequestStatus): string {
  const map: Record<ToolRequestStatus, string> = {
    pending: 'enviada',
    approved: 'aprovada',
    released: 'liberada para retirada',
    rejected: 'rejeitada',
    cancelled: 'cancelada',
  };
  return map[status];
}
