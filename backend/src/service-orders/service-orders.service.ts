import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { OsStatus, UserRole, NotificationType } from '../common/types/database.types';
import {
  ListServiceOrdersDto,
  CreateServiceOrderDto,
  UpdateServiceOrderDto,
} from './dto';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Defines the allowed status transitions for service orders.
 * Each key is the current status, and the value is an array of statuses it can transition to.
 */
const STATUS_TRANSITIONS: Record<OsStatus, OsStatus[]> = {
  [OsStatus.DRAFT]: [OsStatus.PENDING, OsStatus.CANCELLED],
  [OsStatus.PENDING]: [OsStatus.ASSIGNED, OsStatus.CANCELLED],
  [OsStatus.ASSIGNED]: [
    OsStatus.IN_PROGRESS,
    OsStatus.PENDING,
    OsStatus.CANCELLED,
  ],
  [OsStatus.IN_PROGRESS]: [
    OsStatus.PAUSED,
    OsStatus.COMPLETED,
    OsStatus.CANCELLED,
  ],
  [OsStatus.PAUSED]: [OsStatus.IN_PROGRESS, OsStatus.CANCELLED],
  [OsStatus.COMPLETED]: [OsStatus.REJECTED],
  [OsStatus.CANCELLED]: [],
  [OsStatus.REJECTED]: [OsStatus.PENDING],
};

@Injectable()
export class ServiceOrdersService {
  private readonly logger = new Logger(ServiceOrdersService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Retrieves a paginated list of service orders with filters.
   * Access is restricted based on user role:
   * - Admin: can see all orders
   * - Partner: can only see orders assigned to them
   * - Technician: can only see orders assigned to them
   */
  async findAll(
    filters: ListServiceOrdersDto,
    userId: string,
    userRole: UserRole,
  ) {
    const supabase = this.supabaseService.getClient();
    const {
      page = 1,
      limit = 20,
      status,
      priority,
      partner_id,
      technician_id,
      date_from,
      date_to,
      search,
    } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('service_orders')
      .select(
        `
        *,
        technician:profiles!service_orders_technician_id_fkey(id, full_name, email, phone, avatar_url),
        partner:partners!service_orders_partner_id_fkey(id, company_name, trading_name, contact_name)
      `,
        { count: 'exact' },
      );

    // Role-based access control
    if (userRole === UserRole.PARTNER) {
      // Get the partner record for this user
      const { data: partnerData } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (partnerData) {
        query = query.eq('partner_id', partnerData.id);
      } else {
        // Partner has no partner record, return empty results
        return { data: [], meta: { total: 0, page, limit, total_pages: 0 } };
      }
    } else if (userRole === UserRole.TECHNICIAN) {
      query = query.eq('technician_id', userId);
    }
    // Admin can see all

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }

    if (priority) {
      query = query.eq('priority', priority);
    }

    if (partner_id) {
      query = query.eq('partner_id', partner_id);
    }

    if (technician_id) {
      query = query.eq('technician_id', technician_id);
    }

    if (date_from) {
      query = query.gte('created_at', date_from);
    }

    if (date_to) {
      query = query.lte('created_at', `${date_to}T23:59:59.999Z`);
    }

    if (search) {
      query = query.or(
        `title.ilike.%${search}%,client_name.ilike.%${search}%,address_city.ilike.%${search}%`,
      );
    }

    // Pagination and ordering
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      this.logger.error(`Failed to fetch service orders: ${error.message}`);
      throw new InternalServerErrorException(
        'Failed to fetch service orders',
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
   * Retrieves a single service order by ID with all relations.
   */
  async findOne(id: string) {
    const supabase = this.supabaseService.getClient();

    const { data: order, error } = await supabase
      .from('service_orders')
      .select(
        `
        *,
        technician:profiles!service_orders_technician_id_fkey(id, full_name, email, phone, avatar_url, specialties),
        partner:partners!service_orders_partner_id_fkey(id, company_name, trading_name, contact_name, contact_phone, contact_email),
        creator:profiles!service_orders_created_by_fkey(id, full_name, email)
      `,
      )
      .eq('id', id)
      .single();

    if (error || !order) {
      throw new NotFoundException(`Service order with ID ${id} not found`);
    }

    // Get photos count
    const { count: photosCount } = await supabase
      .from('photos')
      .select('id', { count: 'exact', head: true })
      .eq('service_order_id', id);

    // Get latest status history entries
    const { data: statusHistory } = await supabase
      .from('os_status_history')
      .select(
        `
        *,
        changed_by_user:profiles!os_status_history_changed_by_fkey(id, full_name)
      `,
      )
      .eq('service_order_id', id)
      .order('created_at', { ascending: false })
      .limit(10);

    return {
      ...order,
      photos_count: photosCount || 0,
      status_history: statusHistory || [],
    };
  }

  /**
   * Creates a new service order.
   * Generates a sequential order number and sets initial status.
   */
  async create(data: CreateServiceOrderDto, userId: string) {
    const supabase = this.supabaseService.getClient();

    // Determine initial status
    const initialStatus = data.technician_id
      ? OsStatus.ASSIGNED
      : OsStatus.PENDING;

    // Build insert data explicitly (order_number is SERIAL, auto-generated by DB)
    const insertData: Record<string, unknown> = {
      title: data.title,
      status: initialStatus,
      created_by: userId,
    };
    if (data.description) insertData.description = data.description;
    if (data.priority) insertData.priority = data.priority;
    if (data.client_name) insertData.client_name = data.client_name;
    if (data.client_phone) insertData.client_phone = data.client_phone;
    if (data.client_email) insertData.client_email = data.client_email;
    if (data.client_document) insertData.client_document = data.client_document;
    if (data.address_street) insertData.address_street = data.address_street;
    if (data.address_number) insertData.address_number = data.address_number;
    if (data.address_complement) insertData.address_complement = data.address_complement;
    if (data.address_neighborhood) insertData.address_neighborhood = data.address_neighborhood;
    if (data.address_city) insertData.address_city = data.address_city;
    if (data.address_state) insertData.address_state = data.address_state;
    if (data.address_zip) insertData.address_zip = data.address_zip;
    if (data.geo_lat !== undefined) insertData.geo_lat = data.geo_lat;
    if (data.geo_lng !== undefined) insertData.geo_lng = data.geo_lng;
    if (data.partner_id) insertData.partner_id = data.partner_id;
    if (data.technician_id) insertData.technician_id = data.technician_id;
    if (data.scheduled_date) insertData.scheduled_date = data.scheduled_date;
    if (data.estimated_value !== undefined) insertData.estimated_value = data.estimated_value;
    if (data.notes) insertData.notes = data.notes;
    if (data.metadata) insertData.metadata = data.metadata;

    const { data: order, error } = await supabase
      .from('service_orders')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create service order: ${error.message}`);
      throw new InternalServerErrorException(
        'Failed to create service order',
      );
    }

    // Create initial status history entry
    await supabase.from('os_status_history').insert({
      service_order_id: order.id,
      from_status: null,
      to_status: initialStatus,
      changed_by: userId,
      notes: 'Ordem de serviço criada',
    });

    // Audit log
    this.auditService.log({
      userId,
      action: 'service_order.created',
      entityType: 'service_order',
      entityId: order.id,
      newData: order as unknown as Record<string, unknown>,
    });

    // Notify assigned technician
    if (data.technician_id) {
      try {
        await this.notificationsService.create(
          data.technician_id,
          'Nova OS atribuída',
          `Você foi atribuído à OS "${data.title}"`,
          NotificationType.OS_ASSIGNED,
          { service_order_id: order.id },
        );
      } catch {
        // Notification failure should not break the main operation
      }
    }

    return order;
  }

  /**
   * Updates an existing service order.
   * Does not allow changing status directly (use changeStatus for that).
   */
  async update(id: string, data: UpdateServiceOrderDto, userId?: string) {
    const supabase = this.supabaseService.getClient();

    // Verify the order exists
    const { data: existing, error: findError } = await supabase
      .from('service_orders')
      .select('*')
      .eq('id', id)
      .single();

    if (findError || !existing) {
      throw new NotFoundException(`Service order with ID ${id} not found`);
    }

    // Don't allow updates to completed or cancelled orders
    if (
      existing.status === OsStatus.COMPLETED ||
      existing.status === OsStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot update a service order with status: ${existing.status}`,
      );
    }

    // Extract version for optimistic locking (don't send to DB - trigger handles it)
    const { version, ...updatePayload } = data;

    let query = supabase
      .from('service_orders')
      .update({
        ...updatePayload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    // Optimistic locking: only update if version matches
    if (version !== undefined) {
      query = query.eq('version', version);
    }

    const { data: order, error } = await query.select().single();

    if (error) {
      // PGRST116 = "JSON object requested, multiple (or no) rows returned" -> 0 rows = version mismatch
      if (version !== undefined && error.code === 'PGRST116') {
        throw new ConflictException(
          'Dados desatualizados. Recarregue a página e tente novamente.',
        );
      }
      this.logger.error(
        `Failed to update service order ${id}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to update service order',
      );
    }

    // Audit log
    this.auditService.log({
      userId: userId || null,
      action: 'service_order.updated',
      entityType: 'service_order',
      entityId: id,
      oldData: existing as unknown as Record<string, unknown>,
      newData: order as unknown as Record<string, unknown>,
    });

    return order;
  }

  /**
   * Changes the status of a service order with validation of allowed transitions.
   * Creates a status history entry for audit trail.
   */
  async changeStatus(
    id: string,
    newStatus: OsStatus,
    userId: string,
    notes?: string,
    version?: number,
  ) {
    const supabase = this.supabaseService.getClient();

    // Get current order
    const { data: order, error: findError } = await supabase
      .from('service_orders')
      .select('id, status, order_number, started_at, technician_id, partner_id')
      .eq('id', id)
      .single();

    if (findError || !order) {
      throw new NotFoundException(`Service order with ID ${id} not found`);
    }

    const currentStatus = order.status as OsStatus;

    // Validate status transition
    const allowedTransitions = STATUS_TRANSITIONS[currentStatus];
    if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from '${currentStatus}' to '${newStatus}'. Allowed transitions: ${allowedTransitions?.join(', ') || 'none'}`,
      );
    }

    // Build the update object
    const updateData: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    // Set timestamps based on the new status
    if (newStatus === OsStatus.IN_PROGRESS && !order.started_at) {
      updateData.started_at = new Date().toISOString();
    }

    if (newStatus === OsStatus.COMPLETED) {
      updateData.completed_at = new Date().toISOString();
    }

    // Update the order
    let statusQuery = supabase
      .from('service_orders')
      .update(updateData)
      .eq('id', id);

    // Optimistic locking: only update if version matches
    if (version !== undefined) {
      statusQuery = statusQuery.eq('version', version);
    }

    const { data: updatedOrder, error } = await statusQuery.select().single();

    if (error) {
      // PGRST116 = "JSON object requested, multiple (or no) rows returned" -> 0 rows = version mismatch
      if (version !== undefined && error.code === 'PGRST116') {
        throw new ConflictException(
          'Dados desatualizados. Recarregue a página e tente novamente.',
        );
      }
      this.logger.error(
        `Failed to change status for order ${id}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to change service order status',
      );
    }

    // Create status history entry
    const { error: historyError } = await supabase
      .from('os_status_history')
      .insert({
        service_order_id: id,
        from_status: currentStatus,
        to_status: newStatus,
        changed_by: userId,
        notes: notes || null,
      });

    if (historyError) {
      this.logger.warn(
        `Failed to create status history for order ${id}: ${historyError.message}`,
      );
    }

    // Audit log for status change
    this.auditService.log({
      userId,
      action: 'service_order.status_changed',
      entityType: 'service_order',
      entityId: id,
      oldData: { status: currentStatus },
      newData: { status: newStatus },
    });

    // Notify technician about status change
    if (order.technician_id) {
      try {
        await this.notificationsService.create(
          order.technician_id,
          `OS #${order.order_number} - Status alterado`,
          `Status alterado de ${currentStatus} para ${newStatus}`,
          NotificationType.OS_STATUS_CHANGED,
          { service_order_id: id, from_status: currentStatus, to_status: newStatus },
        );
      } catch {
        // Notification failure should not break the main operation
      }
    }

    // Notify partner about status change
    if (order.partner_id) {
      try {
        const { data: partnerData } = await supabase
          .from('partners')
          .select('user_id')
          .eq('id', order.partner_id)
          .single();

        if (partnerData?.user_id) {
          await this.notificationsService.create(
            partnerData.user_id,
            `OS #${order.order_number} - Status alterado`,
            `Status alterado de ${currentStatus} para ${newStatus}`,
            NotificationType.OS_STATUS_CHANGED,
            { service_order_id: id, from_status: currentStatus, to_status: newStatus },
          );
        }
      } catch {
        // Notification failure should not break the main operation
      }
    }

    return updatedOrder;
  }

  /**
   * Retrieves the complete status history (timeline) for a service order.
   */
  async getTimeline(id: string) {
    const supabase = this.supabaseService.getClient();

    // Verify order exists
    const { data: order, error: findError } = await supabase
      .from('service_orders')
      .select('id')
      .eq('id', id)
      .single();

    if (findError || !order) {
      throw new NotFoundException(`Service order with ID ${id} not found`);
    }

    const { data: timeline, error } = await supabase
      .from('os_status_history')
      .select(
        `
        *,
        changed_by_user:profiles!os_status_history_changed_by_fkey(id, full_name, avatar_url, role)
      `,
      )
      .eq('service_order_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.error(
        `Failed to fetch timeline for order ${id}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to fetch service order timeline',
      );
    }

    return timeline || [];
  }

  /**
   * Generates a sequential order number in the format OS-YYYYMMDD-XXXX.
   */
  private async generateOrderNumber(): Promise<string> {
    const supabase = this.supabaseService.getClient();
    const today = new Date();
    const datePrefix = today.toISOString().slice(0, 10).replace(/-/g, '');

    // Get the count of orders created today for sequential numbering
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from('service_orders')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startOfDay.toISOString());

    const sequence = ((count || 0) + 1).toString().padStart(4, '0');

    return `OS-${datePrefix}-${sequence}`;
  }
}
