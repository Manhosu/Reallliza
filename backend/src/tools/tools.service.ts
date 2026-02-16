import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ToolStatus, ToolCondition, NotificationType } from '../common/types/database.types';
import { CreateToolDto, UpdateToolDto } from './dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ToolsService {
  private readonly logger = new Logger(ToolsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Retrieves a paginated list of tools with optional filters.
   */
  async findAllTools(filters: {
    search?: string;
    status?: ToolStatus;
    category?: string;
    page?: number;
    limit?: number;
  }) {
    const supabase = this.supabaseService.getClient();
    const { page = 1, limit = 20, search, status, category } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('tool_inventory')
      .select('*', { count: 'exact' });

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }

    if (category) {
      query = query.eq('category', category);
    }

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,description.ilike.%${search}%,serial_number.ilike.%${search}%`,
      );
    }

    // Pagination and ordering
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      this.logger.error(`Failed to fetch tools: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch tools');
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
   * Retrieves a single tool by ID with current custody info.
   */
  async findOneTool(id: string) {
    const supabase = this.supabaseService.getClient();

    const { data: tool, error } = await supabase
      .from('tool_inventory')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !tool) {
      throw new NotFoundException(`Tool with ID ${id} not found`);
    }

    // Get current active custody (if any)
    const { data: activeCustody } = await supabase
      .from('tool_custody')
      .select(
        `
        *,
        user:profiles!tool_custody_user_id_fkey(id, full_name, email, phone, avatar_url),
        service_order:service_orders!tool_custody_service_order_id_fkey(id, order_number, title)
      `,
      )
      .eq('tool_id', id)
      .is('checked_in_at', null)
      .order('checked_out_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      ...tool,
      current_custody: activeCustody || null,
    };
  }

  /**
   * Creates a new tool in the inventory.
   */
  async createTool(data: CreateToolDto) {
    const supabase = this.supabaseService.getClient();

    const { data: tool, error } = await supabase
      .from('tool_inventory')
      .insert({
        ...data,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create tool: ${error.message}`);
      throw new InternalServerErrorException('Failed to create tool');
    }

    return tool;
  }

  /**
   * Updates an existing tool in the inventory.
   */
  async updateTool(id: string, data: UpdateToolDto) {
    const supabase = this.supabaseService.getClient();

    // Verify the tool exists
    const { data: existing, error: findError } = await supabase
      .from('tool_inventory')
      .select('id')
      .eq('id', id)
      .single();

    if (findError || !existing) {
      throw new NotFoundException(`Tool with ID ${id} not found`);
    }

    const { data: tool, error } = await supabase
      .from('tool_inventory')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to update tool ${id}: ${error.message}`);
      throw new InternalServerErrorException('Failed to update tool');
    }

    return tool;
  }

  /**
   * Checks out a tool to a user.
   * Verifies the tool is available, creates a custody record,
   * and updates the tool status to 'in_use'.
   */
  async checkoutTool(
    toolId: string,
    userId: string,
    serviceOrderId?: string,
    expectedReturnAt?: string,
    conditionOut?: ToolCondition,
    notes?: string,
  ) {
    const supabase = this.supabaseService.getClient();

    // Verify tool exists and is available
    const { data: tool, error: findError } = await supabase
      .from('tool_inventory')
      .select('id, status, name')
      .eq('id', toolId)
      .single();

    if (findError || !tool) {
      throw new NotFoundException(`Tool with ID ${toolId} not found`);
    }

    if (tool.status !== ToolStatus.AVAILABLE) {
      throw new BadRequestException(
        `Tool "${tool.name}" is not available for checkout. Current status: ${tool.status}`,
      );
    }

    // Create custody record
    const { data: custody, error: custodyError } = await supabase
      .from('tool_custody')
      .insert({
        tool_id: toolId,
        user_id: userId,
        service_order_id: serviceOrderId || null,
        checked_out_at: new Date().toISOString(),
        condition_out: conditionOut || ToolCondition.GOOD,
        notes: notes || null,
      })
      .select()
      .single();

    if (custodyError) {
      this.logger.error(
        `Failed to create custody record: ${custodyError.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to create custody record',
      );
    }

    // Update tool status to in_use
    const { error: updateError } = await supabase
      .from('tool_inventory')
      .update({
        status: ToolStatus.IN_USE,
        updated_at: new Date().toISOString(),
      })
      .eq('id', toolId);

    if (updateError) {
      this.logger.error(
        `Failed to update tool status: ${updateError.message}`,
      );
      throw new InternalServerErrorException('Failed to update tool status');
    }

    // Notify the technician about tool assignment
    try {
      await this.notificationsService.create(
        userId,
        'Ferramenta atribuida',
        `A ferramenta "${tool.name}" foi atribuida a voce`,
        NotificationType.TOOL_CUSTODY,
        { tool_id: toolId },
      );
    } catch {
      // Notification failure should not break the main operation
    }

    return custody;
  }

  /**
   * Checks in a tool from a custody record.
   * Updates the custody record with check-in info and
   * sets the tool status back to 'available' (or 'maintenance' if condition is poor/damaged).
   */
  async checkinTool(
    custodyId: string,
    conditionIn: ToolCondition,
    notes?: string,
  ) {
    const supabase = this.supabaseService.getClient();

    // Get the custody record
    const { data: custody, error: findError } = await supabase
      .from('tool_custody')
      .select('id, tool_id, checked_in_at')
      .eq('id', custodyId)
      .single();

    if (findError || !custody) {
      throw new NotFoundException(
        `Custody record with ID ${custodyId} not found`,
      );
    }

    if (custody.checked_in_at) {
      throw new BadRequestException('This tool has already been checked in');
    }

    // Update custody record
    const { data: updatedCustody, error: updateCustodyError } = await supabase
      .from('tool_custody')
      .update({
        checked_in_at: new Date().toISOString(),
        condition_in: conditionIn,
        notes: notes || null,
      })
      .eq('id', custodyId)
      .select()
      .single();

    if (updateCustodyError) {
      this.logger.error(
        `Failed to update custody record: ${updateCustodyError.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to update custody record',
      );
    }

    // Determine new tool status based on condition
    const newStatus =
      conditionIn === ToolCondition.POOR ||
      conditionIn === ToolCondition.DAMAGED
        ? ToolStatus.MAINTENANCE
        : ToolStatus.AVAILABLE;

    // Update tool status
    const { error: updateToolError } = await supabase
      .from('tool_inventory')
      .update({
        status: newStatus,
        condition: conditionIn,
        updated_at: new Date().toISOString(),
      })
      .eq('id', custody.tool_id);

    if (updateToolError) {
      this.logger.error(
        `Failed to update tool status: ${updateToolError.message}`,
      );
      throw new InternalServerErrorException('Failed to update tool status');
    }

    return updatedCustody;
  }

  /**
   * Gets all active custodies (tools not yet returned).
   * Optionally filtered by user.
   */
  async getActiveCustodies(userId?: string) {
    const supabase = this.supabaseService.getClient();

    let query = supabase
      .from('tool_custody')
      .select(
        `
        *,
        tool:tool_inventory!tool_custody_tool_id_fkey(id, name, serial_number, category, image_url),
        user:profiles!tool_custody_user_id_fkey(id, full_name, email, phone, avatar_url),
        service_order:service_orders!tool_custody_service_order_id_fkey(id, order_number, title)
      `,
      )
      .is('checked_in_at', null)
      .order('checked_out_at', { ascending: false });

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error) {
      this.logger.error(
        `Failed to fetch active custodies: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to fetch active custodies',
      );
    }

    return data || [];
  }

  /**
   * Gets the full custody history for a specific tool.
   */
  async getCustodyHistory(toolId: string) {
    const supabase = this.supabaseService.getClient();

    // Verify tool exists
    const { data: tool, error: findError } = await supabase
      .from('tool_inventory')
      .select('id')
      .eq('id', toolId)
      .single();

    if (findError || !tool) {
      throw new NotFoundException(`Tool with ID ${toolId} not found`);
    }

    const { data: history, error } = await supabase
      .from('tool_custody')
      .select(
        `
        *,
        user:profiles!tool_custody_user_id_fkey(id, full_name, email, avatar_url),
        service_order:service_orders!tool_custody_service_order_id_fkey(id, order_number, title)
      `,
      )
      .eq('tool_id', toolId)
      .order('checked_out_at', { ascending: false });

    if (error) {
      this.logger.error(
        `Failed to fetch custody history for tool ${toolId}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to fetch custody history',
      );
    }

    return history || [];
  }
}
