import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export interface AuditLogParams {
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditSearchFilters {
  date_from?: string;
  date_to?: string;
  action?: string;
  entity_type?: string;
  user_id?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Logs an audit entry. Fire-and-forget: does not block the caller.
   * Errors are logged but do not propagate.
   */
  log(params: AuditLogParams): void {
    // Fire-and-forget: run the insert asynchronously
    this.insertAuditLog(params).catch((err) => {
      this.logger.error(
        `Failed to insert audit log: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  /**
   * Internal method to perform the actual database insert.
   */
  private async insertAuditLog(params: AuditLogParams): Promise<void> {
    const supabase = this.supabaseService.getClient();

    const { error } = await supabase.from('audit_logs').insert({
      user_id: params.userId,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      old_data: params.oldData || null,
      new_data: params.newData || null,
      ip_address: params.ipAddress || null,
      user_agent: params.userAgent || null,
    });

    if (error) {
      this.logger.error(`Audit log insert error: ${error.message}`);
    }
  }

  /**
   * Gets the audit trail for a specific entity.
   */
  async getByEntity(entityType: string, entityId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(
        `Failed to fetch audit logs for ${entityType}/${entityId}: ${error.message}`,
      );
      return [];
    }

    return data || [];
  }

  /**
   * Gets audit logs for a specific user with pagination.
   */
  async getByUser(userId: string, page: number = 1, limit: number = 20) {
    const supabase = this.supabaseService.getClient();
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      this.logger.error(
        `Failed to fetch audit logs for user ${userId}: ${error.message}`,
      );
      return {
        data: [],
        meta: { total: 0, page, limit, total_pages: 0 },
      };
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
   * Searches audit logs with filters and pagination.
   */
  async search(
    filters: AuditSearchFilters,
    page: number = 1,
    limit: number = 20,
  ) {
    const supabase = this.supabaseService.getClient();
    const offset = (page - 1) * limit;

    let query = supabase
      .from('audit_logs')
      .select('*, user:profiles!audit_logs_user_id_fkey(id, full_name, email)', { count: 'exact' });

    if (filters.date_from) {
      query = query.gte('created_at', filters.date_from);
    }

    if (filters.date_to) {
      query = query.lte('created_at', `${filters.date_to}T23:59:59.999Z`);
    }

    if (filters.action) {
      query = query.ilike('action', `%${filters.action}%`);
    }

    if (filters.entity_type) {
      query = query.eq('entity_type', filters.entity_type);
    }

    if (filters.user_id) {
      query = query.eq('user_id', filters.user_id);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      this.logger.error(`Failed to search audit logs: ${error.message}`);
      return {
        data: [],
        meta: { total: 0, page, limit, total_pages: 0 },
      };
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
}
