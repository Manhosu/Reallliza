import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { AuditService } from '../../audit/audit.service';

interface StepTemplate {
  id: string;
  step_key: string;
  name: string;
  description: string | null;
  applies_to_type: string;
  order_index: number;
  requires_photos_min: number;
  requires_notes: boolean;
  requires_signature: boolean;
}

export interface StepExecution {
  id: string;
  service_order_id: string;
  template_id: string;
  step_key: string;
  order_index: number;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  started_at: string | null;
  completed_at: string | null;
  photos_count: number;
  notes: string | null;
  metadata: Record<string, unknown>;
}

@Injectable()
export class StepsService {
  private readonly logger = new Logger(StepsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Detecta o tipo da OS olhando external_metadata.tipo. Defaults: GENERIC.
   */
  private detectOsType(metadata: Record<string, unknown> | null): string {
    if (!metadata) return 'GENERIC';
    const tipo = (metadata as { tipo?: string }).tipo;
    if (tipo === 'PERICIA' || tipo === 'INSTALACAO') return tipo;
    return 'GENERIC';
  }

  /**
   * Lista as etapas da OS. Se ainda não foram criadas, instancia a partir do template
   * apropriado para o tipo da OS.
   */
  async getStepsForOrder(serviceOrderId: string, userId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: order, error: orderError } = await supabase
      .from('service_orders')
      .select('id, technician_id, external_metadata, metadata, status')
      .eq('id', serviceOrderId)
      .single();

    if (orderError || !order) {
      throw new NotFoundException('Service order not found');
    }

    const { data: existing } = await supabase
      .from('os_step_executions')
      .select('*')
      .eq('service_order_id', serviceOrderId)
      .order('order_index', { ascending: true });

    if (existing && existing.length > 0) {
      return existing as StepExecution[];
    }

    // Cria a partir do template
    const osType = this.detectOsType(
      (order.external_metadata as Record<string, unknown> | null) ||
        (order.metadata as Record<string, unknown> | null),
    );

    const { data: templates, error: tplError } = await supabase
      .from('os_step_templates')
      .select('*')
      .eq('applies_to_type', osType)
      .eq('is_active', true)
      .order('order_index', { ascending: true });

    if (tplError) {
      throw new InternalServerErrorException(
        'Erro ao buscar templates de etapas',
      );
    }

    const tplList = (templates || []) as StepTemplate[];
    if (tplList.length === 0) {
      return [];
    }

    const rows = tplList.map((t) => ({
      service_order_id: serviceOrderId,
      template_id: t.id,
      step_key: t.step_key,
      order_index: t.order_index,
      status: 'pending',
      photos_count: 0,
    }));

    const { data: created, error: insError } = await supabase
      .from('os_step_executions')
      .insert(rows)
      .select();

    if (insError) {
      this.logger.error(`Failed to seed steps: ${insError.message}`);
      throw new InternalServerErrorException(
        'Erro ao inicializar etapas da OS',
      );
    }

    return created as StepExecution[];
  }

  /**
   * Inicia uma etapa. Só permite se a etapa anterior estiver completa.
   */
  async startStep(stepId: string, userId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: step, error } = await supabase
      .from('os_step_executions')
      .select('*, service_orders!inner(technician_id)')
      .eq('id', stepId)
      .single();

    if (error || !step) {
      throw new NotFoundException('Step not found');
    }

    const techId = (step as { service_orders: { technician_id: string } })
      .service_orders.technician_id;
    if (techId !== userId) {
      throw new ForbiddenException('Você não está atribuído a esta OS');
    }

    if (step.status === 'completed') {
      throw new BadRequestException('Etapa já concluída');
    }

    // Bloquear se a anterior não estiver completa
    if (step.order_index > 1) {
      const { data: previous } = await supabase
        .from('os_step_executions')
        .select('status')
        .eq('service_order_id', step.service_order_id)
        .eq('order_index', step.order_index - 1)
        .single();
      if (previous && previous.status !== 'completed') {
        throw new BadRequestException(
          'Conclua a etapa anterior antes de iniciar esta.',
        );
      }
    }

    const { data: updated } = await supabase
      .from('os_step_executions')
      .update({
        status: 'in_progress',
        started_at: step.started_at || new Date().toISOString(),
      })
      .eq('id', stepId)
      .select()
      .single();

    this.auditService.log({
      userId,
      action: 'os_step.started',
      entityType: 'os_step_execution',
      entityId: stepId,
      newData: { step_key: step.step_key },
    });

    return updated;
  }

  /**
   * Completa uma etapa, validando requisitos do template.
   */
  async completeStep(
    stepId: string,
    userId: string,
    payload: {
      notes?: string;
      photos_count?: number;
      metadata?: Record<string, unknown>;
      metragem_executada?: number;
      intercorrencias?: string;
    },
  ) {
    const supabase = this.supabaseService.getClient();

    const { data: step, error } = await supabase
      .from('os_step_executions')
      .select(
        '*, os_step_templates!inner(requires_photos_min, requires_notes, requires_signature, name), service_orders!inner(technician_id)',
      )
      .eq('id', stepId)
      .single();

    if (error || !step) {
      throw new NotFoundException('Step not found');
    }

    const stepRow = step as StepExecution & {
      os_step_templates: {
        requires_photos_min: number;
        requires_notes: boolean;
        requires_signature: boolean;
        name: string;
      };
      service_orders: { technician_id: string };
    };

    if (stepRow.service_orders.technician_id !== userId) {
      throw new ForbiddenException('Você não está atribuído a esta OS');
    }

    const tpl = stepRow.os_step_templates;
    const photosCount = payload.photos_count ?? stepRow.photos_count ?? 0;
    const notes = payload.notes ?? stepRow.notes;

    if (photosCount < tpl.requires_photos_min) {
      throw new BadRequestException(
        `Etapa "${tpl.name}" requer no mínimo ${tpl.requires_photos_min} foto(s). Atual: ${photosCount}.`,
      );
    }

    if (tpl.requires_notes && (!notes || notes.trim().length === 0)) {
      throw new BadRequestException(
        `Etapa "${tpl.name}" requer observações.`,
      );
    }

    const { data: updated, error: updErr } = await supabase
      .from('os_step_executions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        photos_count: photosCount,
        notes: notes || null,
        metadata: payload.metadata ?? stepRow.metadata,
      })
      .eq('id', stepId)
      .select()
      .single();

    if (updErr) {
      throw new InternalServerErrorException('Erro ao concluir etapa');
    }

    // FINALIZACAO: persiste metragem/intercorrências em service_orders
    if (
      stepRow.step_key === 'FINALIZACAO' &&
      (payload.metragem_executada !== undefined || payload.intercorrencias !== undefined)
    ) {
      const updateOrder: Record<string, unknown> = {};
      if (payload.metragem_executada !== undefined) {
        updateOrder.metragem_executada = payload.metragem_executada;
      }
      if (payload.intercorrencias !== undefined) {
        updateOrder.intercorrencias = payload.intercorrencias;
      }
      await supabase
        .from('service_orders')
        .update(updateOrder)
        .eq('id', stepRow.service_order_id);
    }

    this.auditService.log({
      userId,
      action: 'os_step.completed',
      entityType: 'os_step_execution',
      entityId: stepId,
      newData: { step_key: stepRow.step_key, photos_count: photosCount },
    });

    return updated;
  }

  /**
   * Verifica se todas as etapas de uma OS estão completas.
   * Usado pelo ServiceOrdersService antes de permitir status COMPLETED.
   */
  async areAllStepsCompleted(serviceOrderId: string): Promise<boolean> {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('os_step_executions')
      .select('status')
      .eq('service_order_id', serviceOrderId);

    if (error || !data || data.length === 0) {
      // Se não há etapas (template ainda não associado), permite finalizar
      return true;
    }

    return data.every((s) => s.status === 'completed' || s.status === 'skipped');
  }
}
