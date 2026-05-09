import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType, OsStatus, UserRole } from '../common/types/database.types';
import { CreateProposalDto, RespondProposalDto, ListProposalsDto, Proposal } from './dto';

/** Campos sensíveis da OS — ocultados enquanto proposta está 'pending' */
const SENSITIVE_OS_FIELDS = [
  'client_name', 'client_phone', 'client_email', 'client_document',
  'address_street', 'address_number', 'address_complement',
];

const OS_SELECT = `
  id, order_number, title, description, priority, status,
  address_neighborhood, address_city, address_state, address_zip,
  geo_lat, geo_lng, scheduled_date, estimated_value,
  client_name, client_phone, client_email, client_document,
  address_street, address_number, address_complement,
  external_metadata
`;

@Injectable()
export class ProposalsService {
  private readonly logger = new Logger(ProposalsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Lista propostas com privacidade.
   * Técnico: propostas abertas (partner_id IS NULL) + as que ele já respondeu.
   * Parceiro: propostas direcionadas ao seu registro de parceiro.
   * Admin: todas.
   */
  async findAll(filters: ListProposalsDto, userId: string, userRole: UserRole) {
    const supabase = this.supabaseService.getClient();
    const { page = 1, limit = 20, status } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('service_proposals')
      .select(
        `*, service_order:service_orders!service_proposals_service_order_id_fkey(${OS_SELECT}), proposer:profiles!service_proposals_proposed_by_fkey(id, full_name)`,
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (userRole === UserRole.TECHNICIAN) {
      query = query.or(`partner_id.is.null,accepted_by.eq.${userId}`);
    } else if (userRole === UserRole.PARTNER) {
      const { data: partnerRecord } = await supabase
        .from('partners').select('id').eq('user_id', userId).maybeSingle();
      if (partnerRecord) {
        query = query.eq('partner_id', partnerRecord.id);
      } else {
        return { data: [], meta: { total: 0, page, limit, total_pages: 0 } };
      }
    }

    if (status) query = query.eq('status', status);

    const { data, error, count } = await query;
    if (error) {
      this.logger.error(`Failed to list proposals: ${error.message}`);
      throw new InternalServerErrorException('Erro ao listar propostas');
    }

    return {
      data: (data ?? []).map((p) => this.maskSensitiveData(p)),
      meta: { total: count ?? 0, page, limit, total_pages: Math.ceil((count ?? 0) / limit) },
    };
  }

  /**
   * Busca proposta por ID.
   */
  async findOne(id: string, userId: string, userRole: UserRole) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('service_proposals')
      .select(`*, service_order:service_orders!service_proposals_service_order_id_fkey(${OS_SELECT}), proposer:profiles!service_proposals_proposed_by_fkey(id, full_name)`)
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundException('Proposta não encontrada');

    if (userRole === UserRole.TECHNICIAN && data.accepted_by && data.accepted_by !== userId) {
      throw new NotFoundException('Proposta não encontrada');
    }

    return this.maskSensitiveData(data);
  }

  /**
   * Cria nova proposta (admin only).
   */
  async create(dto: CreateProposalDto, adminId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: order, error: orderError } = await supabase
      .from('service_orders')
      .select('id, title, order_number, status')
      .eq('id', dto.service_order_id)
      .single();

    if (orderError || !order) throw new NotFoundException('OS não encontrada');
    if (['completed', 'cancelled'].includes(order.status)) {
      throw new BadRequestException('Não é possível criar proposta para OS finalizada ou cancelada');
    }

    const { data: proposal, error } = await supabase
      .from('service_proposals')
      .insert({
        service_order_id: dto.service_order_id,
        partner_id: dto.technician_id ?? null,
        proposed_value: dto.proposed_value ?? null,
        message: dto.message ?? null,
        proposed_by: adminId,
        expires_at: dto.expires_at ?? null,
      })
      .select()
      .single();

    if (error || !proposal) {
      this.logger.error(`Failed to create proposal: ${error?.message}`);
      throw new InternalServerErrorException('Erro ao criar proposta');
    }

    this.auditService.log({
      userId: adminId,
      action: 'proposal.created',
      entityType: 'service_proposal',
      entityId: proposal.id,
      newData: { service_order_id: dto.service_order_id },
    });

    return proposal as Proposal;
  }

  /**
   * Responde à proposta. Ao aceitar: OS ASSIGNED + outras propostas rejeitadas.
   */
  async respond(proposalId: string, dto: RespondProposalDto, userId: string, userRole: UserRole) {
    const supabase = this.supabaseService.getClient();

    const { data: proposal, error: findError } = await supabase
      .from('service_proposals')
      .select(`*, service_order:service_orders!service_proposals_service_order_id_fkey(id, order_number, status)`)
      .eq('id', proposalId)
      .single();

    if (findError || !proposal) throw new NotFoundException('Proposta não encontrada');
    if (proposal.status !== 'pending') {
      throw new BadRequestException(`Proposta já está com status: ${proposal.status}`);
    }
    if (proposal.expires_at && new Date(proposal.expires_at) < new Date()) {
      await supabase.from('service_proposals').update({ status: 'expired' }).eq('id', proposalId);
      throw new BadRequestException('Esta proposta expirou');
    }

    const now = new Date().toISOString();
    const order = proposal.service_order as { id: string; order_number: string; status: string };

    if (dto.action === 'accept') {
      if (['assigned', 'in_progress'].includes(order.status)) {
        throw new BadRequestException('Esta OS já foi aceita por outro técnico');
      }

      const { error: updateErr } = await supabase
        .from('service_proposals')
        .update({ status: 'accepted', accepted_by: userId, responded_at: now, response_message: dto.response_message ?? null })
        .eq('id', proposalId);
      if (updateErr) throw new InternalServerErrorException('Erro ao aceitar proposta');

      await supabase
        .from('service_proposals')
        .update({ status: 'rejected', responded_at: now, response_message: 'Aceita por outro técnico' })
        .eq('service_order_id', proposal.service_order_id)
        .eq('status', 'pending')
        .neq('id', proposalId);

      const { error: osError } = await supabase
        .from('service_orders')
        .update({ technician_id: userId, status: OsStatus.ASSIGNED, updated_at: now })
        .eq('id', proposal.service_order_id);
      if (osError) this.logger.error(`Failed to assign OS: ${osError.message}`);

      this.auditService.log({ userId, action: 'proposal.accepted', entityType: 'service_proposal', entityId: proposalId, newData: { service_order_id: proposal.service_order_id } });

      try {
        const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin').eq('status', 'active');
        for (const admin of admins ?? []) {
          await this.notificationsService.create(
            admin.id, 'Proposta aceita',
            `OS #${order.order_number} foi aceita por um técnico`,
            NotificationType.OS_ASSIGNED,
            { proposal_id: proposalId, service_order_id: proposal.service_order_id, type: 'proposal_accepted' },
          );
        }
      } catch { /* não bloqueia */ }
    } else {
      const { error: rejectErr } = await supabase
        .from('service_proposals')
        .update({ status: 'rejected', responded_at: now, response_message: dto.response_message ?? null })
        .eq('id', proposalId);
      if (rejectErr) throw new InternalServerErrorException('Erro ao rejeitar proposta');
      this.auditService.log({ userId, action: 'proposal.rejected', entityType: 'service_proposal', entityId: proposalId, newData: {} });
    }

    const { data: updated } = await supabase.from('service_proposals').select('*').eq('id', proposalId).single();
    return updated as Proposal;
  }

  /** Oculta dados sensíveis da OS quando proposta ainda está pending */
  private maskSensitiveData(proposal: Proposal & { service_order?: Record<string, unknown> }) {
    if (!proposal.service_order || proposal.status !== 'pending') return proposal;
    const masked = { ...proposal.service_order };
    for (const field of SENSITIVE_OS_FIELDS) {
      if (field in masked) masked[field] = null;
    }
    return { ...proposal, service_order: masked };
  }
}
