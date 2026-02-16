import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  ListTemplatesDto,
  CreateTemplateDto,
  UpdateTemplateDto,
  UpdateChecklistItemsDto,
} from './dto';
import { randomUUID } from 'crypto';

@Injectable()
export class ChecklistsService {
  private readonly logger = new Logger(ChecklistsService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  // ============================================================
  // Template CRUD (admin only)
  // ============================================================

  /**
   * Retrieves a paginated list of checklist templates with optional filters.
   */
  async findAllTemplates(filters: ListTemplatesDto) {
    const supabase = this.supabaseService.getClient();
    const { page = 1, limit = 20, search, is_active } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('checklist_templates')
      .select('*', { count: 'exact' });

    if (is_active !== undefined) {
      query = query.eq('is_active', is_active);
    }

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      this.logger.error(
        `Failed to fetch checklist templates: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to fetch checklist templates',
      );
    }

    return {
      data: data || [],
      meta: {
        total: count || 0,
        page,
        limit,
        total_pages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Retrieves a single checklist template by ID.
   */
  async findOneTemplate(id: string) {
    const supabase = this.supabaseService.getClient();

    const { data: template, error } = await supabase
      .from('checklist_templates')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !template) {
      throw new NotFoundException(
        `Checklist template with ID ${id} not found`,
      );
    }

    return template;
  }

  /**
   * Creates a new checklist template.
   * Items are stored as a JSON array with generated IDs.
   */
  async createTemplate(data: CreateTemplateDto, userId: string) {
    const supabase = this.supabaseService.getClient();

    // Generate IDs and normalize items
    const items = (data.items || []).map((item, index) => ({
      id: randomUUID(),
      label: item.label,
      required: item.required ?? false,
      order: item.order ?? index,
    }));

    const { data: template, error } = await supabase
      .from('checklist_templates')
      .insert({
        name: data.name,
        description: data.description || null,
        items,
        is_active: true,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(
        `Failed to create checklist template: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to create checklist template',
      );
    }

    return template;
  }

  /**
   * Updates an existing checklist template.
   */
  async updateTemplate(id: string, data: UpdateTemplateDto) {
    const supabase = this.supabaseService.getClient();

    // Verify the template exists
    const { data: existing, error: findError } = await supabase
      .from('checklist_templates')
      .select('id')
      .eq('id', id)
      .single();

    if (findError || !existing) {
      throw new NotFoundException(
        `Checklist template with ID ${id} not found`,
      );
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (data.name !== undefined) {
      updateData.name = data.name;
    }

    if (data.description !== undefined) {
      updateData.description = data.description;
    }

    if (data.is_active !== undefined) {
      updateData.is_active = data.is_active;
    }

    if (data.items !== undefined) {
      updateData.items = data.items.map((item, index) => ({
        id: randomUUID(),
        label: item.label,
        required: item.required ?? false,
        order: item.order ?? index,
      }));
    }

    const { data: template, error } = await supabase
      .from('checklist_templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(
        `Failed to update checklist template ${id}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to update checklist template',
      );
    }

    return template;
  }

  /**
   * Deactivates a checklist template by setting is_active = false.
   */
  async deactivateTemplate(id: string) {
    const supabase = this.supabaseService.getClient();

    // Verify the template exists
    const { data: existing, error: findError } = await supabase
      .from('checklist_templates')
      .select('id')
      .eq('id', id)
      .single();

    if (findError || !existing) {
      throw new NotFoundException(
        `Checklist template with ID ${id} not found`,
      );
    }

    const { data: template, error } = await supabase
      .from('checklist_templates')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(
        `Failed to deactivate checklist template ${id}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to deactivate checklist template',
      );
    }

    return template;
  }

  // ============================================================
  // Checklist operations
  // ============================================================

  /**
   * Retrieves all checklists for a specific service order.
   */
  async findByServiceOrder(serviceOrderId: string) {
    const supabase = this.supabaseService.getClient();

    // Verify the service order exists
    const { data: serviceOrder, error: soError } = await supabase
      .from('service_orders')
      .select('id')
      .eq('id', serviceOrderId)
      .single();

    if (soError || !serviceOrder) {
      throw new NotFoundException(
        `Service order with ID ${serviceOrderId} not found`,
      );
    }

    const { data: checklists, error } = await supabase
      .from('checklists')
      .select(
        `
        *,
        template:checklist_templates!checklists_template_id_fkey(id, name),
        completed_by_user:profiles!checklists_completed_by_fkey(id, full_name)
      `,
      )
      .eq('service_order_id', serviceOrderId)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(
        `Failed to fetch checklists for service order ${serviceOrderId}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to fetch checklists for service order',
      );
    }

    return checklists || [];
  }

  /**
   * Retrieves a single checklist by ID with template info.
   */
  async findOne(id: string) {
    const supabase = this.supabaseService.getClient();

    const { data: checklist, error } = await supabase
      .from('checklists')
      .select(
        `
        *,
        template:checklist_templates!checklists_template_id_fkey(id, name, description),
        completed_by_user:profiles!checklists_completed_by_fkey(id, full_name)
      `,
      )
      .eq('id', id)
      .single();

    if (error || !checklist) {
      throw new NotFoundException(`Checklist with ID ${id} not found`);
    }

    return checklist;
  }

  /**
   * Creates a new checklist from a template for a specific service order.
   * Copies template items into the checklist's items JSON field.
   */
  async createFromTemplate(
    serviceOrderId: string,
    templateId: string,
    userId: string,
  ) {
    const supabase = this.supabaseService.getClient();

    // Verify the service order exists
    const { data: serviceOrder, error: soError } = await supabase
      .from('service_orders')
      .select('id')
      .eq('id', serviceOrderId)
      .single();

    if (soError || !serviceOrder) {
      throw new NotFoundException(
        `Service order with ID ${serviceOrderId} not found`,
      );
    }

    // Get the template
    const { data: template, error: templateError } = await supabase
      .from('checklist_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (templateError || !template) {
      throw new NotFoundException(
        `Checklist template with ID ${templateId} not found`,
      );
    }

    if (!template.is_active) {
      throw new BadRequestException(
        'Cannot create a checklist from an inactive template',
      );
    }

    // Convert template items to checklist items (unchecked by default)
    const templateItems = (template.items || []) as Array<{
      id: string;
      label: string;
      required: boolean;
      order: number;
    }>;

    const checklistItems = templateItems.map((item) => ({
      id: randomUUID(),
      label: item.label,
      checked: false,
      notes: null,
      checked_at: null,
    }));

    const { data: checklist, error } = await supabase
      .from('checklists')
      .insert({
        service_order_id: serviceOrderId,
        template_id: templateId,
        title: template.name,
        items: checklistItems,
        completed_at: null,
        completed_by: null,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create checklist: ${error.message}`);
      throw new InternalServerErrorException('Failed to create checklist');
    }

    return checklist;
  }

  /**
   * Updates checklist items (save progress).
   * Validates that the checklist exists.
   */
  async updateItems(
    id: string,
    updateDto: UpdateChecklistItemsDto,
    userId: string,
  ) {
    const supabase = this.supabaseService.getClient();

    // Verify the checklist exists
    const { data: existing, error: findError } = await supabase
      .from('checklists')
      .select('id, completed_at')
      .eq('id', id)
      .single();

    if (findError || !existing) {
      throw new NotFoundException(`Checklist with ID ${id} not found`);
    }

    if (existing.completed_at) {
      throw new BadRequestException(
        'Cannot update items of a completed checklist',
      );
    }

    // Extract version for optimistic locking (don't send to DB - trigger handles it)
    const { version } = updateDto;

    let query = supabase
      .from('checklists')
      .update({
        items: updateDto.items,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    // Optimistic locking: only update if version matches
    if (version !== undefined) {
      query = query.eq('version', version);
    }

    const { data: checklist, error } = await query.select().single();

    if (error) {
      // PGRST116 = "JSON object requested, multiple (or no) rows returned" -> 0 rows = version mismatch
      if (version !== undefined && error.code === 'PGRST116') {
        throw new ConflictException(
          'Dados desatualizados. Recarregue a pagina e tente novamente.',
        );
      }
      this.logger.error(
        `Failed to update checklist items ${id}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to update checklist items',
      );
    }

    return checklist;
  }

  /**
   * Marks a checklist as completed.
   * Validates that all required items (from the template) are checked.
   */
  async completeChecklist(id: string, userId: string, version?: number) {
    const supabase = this.supabaseService.getClient();

    // Get the checklist with template info
    const { data: checklist, error: findError } = await supabase
      .from('checklists')
      .select('*, template:checklist_templates!checklists_template_id_fkey(*)')
      .eq('id', id)
      .single();

    if (findError || !checklist) {
      throw new NotFoundException(`Checklist with ID ${id} not found`);
    }

    if (checklist.completed_at) {
      throw new BadRequestException('Checklist is already completed');
    }

    // Validate required items are checked
    const checklistItems = (checklist.items || []) as Array<{
      id: string;
      label: string;
      checked: boolean;
    }>;

    const templateItems = (checklist.template?.items || []) as Array<{
      label: string;
      required: boolean;
    }>;

    // Build a set of required labels from the template
    const requiredLabels = new Set(
      templateItems.filter((i) => i.required).map((i) => i.label),
    );

    // Check that all required items are checked
    if (requiredLabels.size > 0) {
      const uncheckedRequired = checklistItems.filter(
        (item) => requiredLabels.has(item.label) && !item.checked,
      );

      if (uncheckedRequired.length > 0) {
        const labels = uncheckedRequired.map((i) => i.label).join(', ');
        throw new BadRequestException(
          `Cannot complete checklist. The following required items are not checked: ${labels}`,
        );
      }
    }

    let completeQuery = supabase
      .from('checklists')
      .update({
        completed_at: new Date().toISOString(),
        completed_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    // Optimistic locking: only update if version matches
    if (version !== undefined) {
      completeQuery = completeQuery.eq('version', version);
    }

    const { data: updated, error } = await completeQuery.select().single();

    if (error) {
      // PGRST116 = "JSON object requested, multiple (or no) rows returned" -> 0 rows = version mismatch
      if (version !== undefined && error.code === 'PGRST116') {
        throw new ConflictException(
          'Dados desatualizados. Recarregue a pagina e tente novamente.',
        );
      }
      this.logger.error(
        `Failed to complete checklist ${id}: ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to complete checklist');
    }

    return updated;
  }
}
