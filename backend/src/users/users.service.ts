import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ListUsersDto, UpdateUserDto } from './dto';
import { UserStatus } from '../common/types/database.types';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Retrieves a paginated list of users with optional filters.
   * Supports filtering by role, status, and text search (name/email/phone).
   */
  async findAll(filters: ListUsersDto) {
    const supabase = this.supabaseService.getClient();
    const { page = 1, limit = 20, role, status, search } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('profiles')
      .select('*', { count: 'exact' });

    // Apply filters
    if (role) {
      query = query.eq('role', role);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.or(
        `full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`,
      );
    }

    // Apply pagination and ordering
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      this.logger.error(`Failed to fetch users: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch users');
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
   * Retrieves a single user by ID, including partner data if applicable.
   */
  async findOne(id: string) {
    const supabase = this.supabaseService.getClient();

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !profile) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // If the user is a partner, fetch their partner data
    let partner = null;
    if (profile.role === 'partner') {
      const { data: partnerData } = await supabase
        .from('partners')
        .select('*')
        .eq('user_id', id)
        .single();

      partner = partnerData;
    }

    return {
      ...profile,
      partner,
    };
  }

  /**
   * Updates a user's profile data.
   */
  async update(id: string, data: UpdateUserDto) {
    const supabase = this.supabaseService.getClient();

    // Verify user exists and get old data for audit
    const { data: existing, error: findError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (findError || !existing) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to update user ${id}: ${error.message}`);
      throw new InternalServerErrorException('Failed to update user');
    }

    // Audit log
    this.auditService.log({
      userId: id,
      action: 'user.updated',
      entityType: 'user',
      entityId: id,
      oldData: existing as unknown as Record<string, unknown>,
      newData: profile as unknown as Record<string, unknown>,
    });

    return profile;
  }

  /**
   * Deactivates a user by setting their status to inactive.
   * Also disables their Supabase auth account.
   */
  async deactivate(id: string) {
    const supabase = this.supabaseService.getClient();

    // Verify user exists
    const { data: existing, error: findError } = await supabase
      .from('profiles')
      .select('id, status')
      .eq('id', id)
      .single();

    if (findError || !existing) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const oldStatus = existing.status;

    // Update profile status
    const { data: profile, error } = await supabase
      .from('profiles')
      .update({
        status: UserStatus.INACTIVE,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to deactivate user ${id}: ${error.message}`);
      throw new InternalServerErrorException('Failed to deactivate user');
    }

    // Also ban the user in Supabase Auth to prevent login
    const { error: authError } = await supabase.auth.admin.updateUserById(id, {
      ban_duration: 'none', // indefinite ban
    });

    if (authError) {
      this.logger.warn(
        `Failed to ban user ${id} in auth: ${authError.message}`,
      );
    }

    // Audit log
    this.auditService.log({
      userId: id,
      action: 'user.status_changed',
      entityType: 'user',
      entityId: id,
      oldData: { status: oldStatus },
      newData: { status: UserStatus.INACTIVE },
    });

    return profile;
  }

  /**
   * Updates a user's status (activate/deactivate/suspend).
   */
  async updateStatus(id: string, status: UserStatus) {
    const supabase = this.supabaseService.getClient();

    // Verify user exists
    const { data: existing, error: findError } = await supabase
      .from('profiles')
      .select('id, status')
      .eq('id', id)
      .single();

    if (findError || !existing) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const oldStatus = existing.status;

    // Update profile status
    const { data: profile, error } = await supabase
      .from('profiles')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(
        `Failed to update status for user ${id}: ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to update user status');
    }

    // Handle auth state based on new status
    if (status === UserStatus.INACTIVE || status === UserStatus.SUSPENDED) {
      await supabase.auth.admin.updateUserById(id, {
        ban_duration: 'none',
      });
    } else if (status === UserStatus.ACTIVE) {
      // Remove ban if reactivating
      await supabase.auth.admin.updateUserById(id, {
        ban_duration: '0',
      });
    }

    // Audit log
    this.auditService.log({
      userId: id,
      action: 'user.status_changed',
      entityType: 'user',
      entityId: id,
      oldData: { status: oldStatus },
      newData: { status },
    });

    return profile;
  }
}
