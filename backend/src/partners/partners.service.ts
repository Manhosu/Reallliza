import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UserRole, OsStatus } from '../common/types/database.types';
import {
  ListPartnersDto,
  CreatePartnerDto,
  UpdatePartnerDto,
} from './dto';

@Injectable()
export class PartnersService {
  private readonly logger = new Logger(PartnersService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Retrieves a paginated list of partners with filters.
   */
  async findAll(filters: ListPartnersDto) {
    const supabase = this.supabaseService.getClient();
    const { page = 1, limit = 20, search, is_active } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('partners')
      .select(
        `
        *,
        user:profiles!partners_user_id_fkey(id, full_name, email, phone, avatar_url)
      `,
        { count: 'exact' },
      );

    // Apply filters
    if (is_active !== undefined) {
      query = query.eq('is_active', is_active);
    }

    if (search) {
      query = query.or(
        `company_name.ilike.%${search}%,trading_name.ilike.%${search}%,contact_name.ilike.%${search}%,cnpj.ilike.%${search}%`,
      );
    }

    // Pagination and ordering
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      this.logger.error(`Failed to fetch partners: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch partners');
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
   * Retrieves a single partner by ID with related user profile info.
   */
  async findOne(id: string) {
    const supabase = this.supabaseService.getClient();

    const { data: partner, error } = await supabase
      .from('partners')
      .select(
        `
        *,
        user:profiles!partners_user_id_fkey(id, full_name, email, phone, avatar_url, role, status)
      `,
      )
      .eq('id', id)
      .single();

    if (error || !partner) {
      throw new NotFoundException(`Partner with ID ${id} not found`);
    }

    return partner;
  }

  /**
   * Creates a new partner.
   * If user_id is provided, verifies the user exists and has role 'partner'.
   */
  async create(data: CreatePartnerDto, userId: string) {
    const supabase = this.supabaseService.getClient();

    // If user_id is provided, verify the user exists and has role 'partner'
    if (data.user_id) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', data.user_id)
        .single();

      if (profileError || !profile) {
        throw new BadRequestException(
          `User with ID ${data.user_id} not found`,
        );
      }

      if (profile.role !== UserRole.PARTNER) {
        throw new BadRequestException(
          `User with ID ${data.user_id} does not have the 'partner' role`,
        );
      }

      // Check if a partner record already exists for this user
      const { data: existingPartner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', data.user_id)
        .single();

      if (existingPartner) {
        throw new BadRequestException(
          `A partner record already exists for user ${data.user_id}`,
        );
      }
    }

    const { data: partner, error } = await supabase
      .from('partners')
      .insert({
        ...data,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create partner: ${error.message}`);
      throw new InternalServerErrorException('Failed to create partner');
    }

    return partner;
  }

  /**
   * Updates an existing partner.
   */
  async update(id: string, data: UpdatePartnerDto) {
    const supabase = this.supabaseService.getClient();

    // Verify the partner exists
    const { data: existing, error: findError } = await supabase
      .from('partners')
      .select('id')
      .eq('id', id)
      .single();

    if (findError || !existing) {
      throw new NotFoundException(`Partner with ID ${id} not found`);
    }

    // If updating user_id, verify the user exists and has role 'partner'
    if (data.user_id) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', data.user_id)
        .single();

      if (profileError || !profile) {
        throw new BadRequestException(
          `User with ID ${data.user_id} not found`,
        );
      }

      if (profile.role !== UserRole.PARTNER) {
        throw new BadRequestException(
          `User with ID ${data.user_id} does not have the 'partner' role`,
        );
      }
    }

    const { data: partner, error } = await supabase
      .from('partners')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to update partner ${id}: ${error.message}`);
      throw new InternalServerErrorException('Failed to update partner');
    }

    return partner;
  }

  /**
   * Soft deletes a partner by setting is_active to false.
   */
  async deactivate(id: string) {
    const supabase = this.supabaseService.getClient();

    // Verify the partner exists
    const { data: existing, error: findError } = await supabase
      .from('partners')
      .select('id, is_active')
      .eq('id', id)
      .single();

    if (findError || !existing) {
      throw new NotFoundException(`Partner with ID ${id} not found`);
    }

    if (!existing.is_active) {
      throw new BadRequestException('Partner is already inactive');
    }

    const { data: partner, error } = await supabase
      .from('partners')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(
        `Failed to deactivate partner ${id}: ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to deactivate partner');
    }

    return partner;
  }

  /**
   * Re-activates a partner by setting is_active to true.
   */
  async activate(id: string) {
    const supabase = this.supabaseService.getClient();

    // Verify the partner exists
    const { data: existing, error: findError } = await supabase
      .from('partners')
      .select('id, is_active')
      .eq('id', id)
      .single();

    if (findError || !existing) {
      throw new NotFoundException(`Partner with ID ${id} not found`);
    }

    if (existing.is_active) {
      throw new BadRequestException('Partner is already active');
    }

    const { data: partner, error } = await supabase
      .from('partners')
      .update({
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(
        `Failed to activate partner ${id}: ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to activate partner');
    }

    return partner;
  }

  /**
   * Gets the partner record associated with a user ID.
   */
  async getByUserId(userId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: partner, error } = await supabase
      .from('partners')
      .select(
        `
        *,
        user:profiles!partners_user_id_fkey(id, full_name, email, phone, avatar_url, role, status)
      `,
      )
      .eq('user_id', userId)
      .single();

    if (error || !partner) {
      throw new NotFoundException(
        `Partner record not found for user ${userId}`,
      );
    }

    return partner;
  }

  /**
   * Retrieves all service orders for a specific partner with pagination and filters.
   */
  async getServiceOrders(
    partnerId: string,
    query: {
      page?: number;
      limit?: number;
      status?: string;
      search?: string;
    },
  ) {
    const supabase = this.supabaseService.getClient();

    // Verify the partner exists
    const { data: partner, error: findError } = await supabase
      .from('partners')
      .select('id')
      .eq('id', partnerId)
      .single();

    if (findError || !partner) {
      throw new NotFoundException(`Partner with ID ${partnerId} not found`);
    }

    const { page = 1, limit = 20, status, search } = query;
    const offset = (page - 1) * limit;

    let dbQuery = supabase
      .from('service_orders')
      .select(
        `
        *,
        technician:profiles!service_orders_technician_id_fkey(id, full_name, email, phone, avatar_url)
      `,
        { count: 'exact' },
      )
      .eq('partner_id', partnerId);

    if (status) {
      dbQuery = dbQuery.eq('status', status);
    }

    if (search) {
      dbQuery = dbQuery.or(
        `order_number.ilike.%${search}%,title.ilike.%${search}%,client_name.ilike.%${search}%`,
      );
    }

    dbQuery = dbQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await dbQuery;

    if (error) {
      this.logger.error(
        `Failed to fetch service orders for partner ${partnerId}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to fetch partner service orders',
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
   * Retrieves statistics for a specific partner (OS counts by status).
   */
  async getStats(partnerId: string) {
    const supabase = this.supabaseService.getClient();

    // Verify the partner exists
    const { data: partner, error: findError } = await supabase
      .from('partners')
      .select('id')
      .eq('id', partnerId)
      .single();

    if (findError || !partner) {
      throw new NotFoundException(`Partner with ID ${partnerId} not found`);
    }

    // Get all service orders for this partner to compute stats
    const { data: orders, error } = await supabase
      .from('service_orders')
      .select('status')
      .eq('partner_id', partnerId);

    if (error) {
      this.logger.error(
        `Failed to fetch stats for partner ${partnerId}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to fetch partner stats',
      );
    }

    // Build counts by status
    const statusCounts: Record<string, number> = {
      [OsStatus.DRAFT]: 0,
      [OsStatus.PENDING]: 0,
      [OsStatus.ASSIGNED]: 0,
      [OsStatus.IN_PROGRESS]: 0,
      [OsStatus.PAUSED]: 0,
      [OsStatus.COMPLETED]: 0,
      [OsStatus.CANCELLED]: 0,
      [OsStatus.REJECTED]: 0,
    };

    let total = 0;
    if (orders) {
      for (const order of orders) {
        const orderStatus = order.status as string;
        if (orderStatus in statusCounts) {
          statusCounts[orderStatus]++;
        }
        total++;
      }
    }

    return {
      partner_id: partnerId,
      total_service_orders: total,
      by_status: statusCounts,
    };
  }
}
