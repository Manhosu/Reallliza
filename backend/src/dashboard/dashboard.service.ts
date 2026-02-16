import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { OsStatus, UserRole } from '../common/types/database.types';

/** Portuguese month abbreviations (0-indexed). */
const MONTH_NAMES_PT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  // ------------------------------------------------------------------
  // Stats
  // ------------------------------------------------------------------

  /**
   * Returns aggregated counts of service orders by status category.
   * Applies role-based filtering so each user only sees relevant data.
   */
  async getStats(userId: string, userRole: UserRole) {
    const supabase = this.supabaseService.getClient();

    // We need to count orders in several status buckets.
    // Supabase JS doesn't support multiple conditional counts in a single
    // request, so we issue four lightweight head-only queries in parallel.

    const partnerId = await this.resolvePartnerId(userId, userRole);

    const applyRoleFilter = (query: any) => {
      if (userRole === UserRole.PARTNER && partnerId) {
        return query.eq('partner_id', partnerId);
      }
      if (userRole === UserRole.TECHNICIAN) {
        return query.eq('technician_id', userId);
      }
      return query; // admin – no extra filter
    };

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // Open: draft, pending, assigned
    const openQuery = applyRoleFilter(
      supabase
        .from('service_orders')
        .select('id', { count: 'exact', head: true })
        .in('status', [OsStatus.DRAFT, OsStatus.PENDING, OsStatus.ASSIGNED]),
    );

    // In progress
    const inProgressQuery = applyRoleFilter(
      supabase
        .from('service_orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', OsStatus.IN_PROGRESS),
    );

    // Completed
    const completedQuery = applyRoleFilter(
      supabase
        .from('service_orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', OsStatus.COMPLETED),
    );

    // Overdue: pending/assigned/in_progress with scheduled_date < today
    const overdueQuery = applyRoleFilter(
      supabase
        .from('service_orders')
        .select('id', { count: 'exact', head: true })
        .in('status', [OsStatus.PENDING, OsStatus.ASSIGNED, OsStatus.IN_PROGRESS])
        .lt('scheduled_date', today),
    );

    const [openRes, inProgressRes, completedRes, overdueRes] =
      await Promise.all([openQuery, inProgressQuery, completedQuery, overdueQuery]);

    if (openRes.error || inProgressRes.error || completedRes.error || overdueRes.error) {
      const msg =
        openRes.error?.message ||
        inProgressRes.error?.message ||
        completedRes.error?.message ||
        overdueRes.error?.message;
      this.logger.error(`Failed to fetch dashboard stats: ${msg}`);
      throw new InternalServerErrorException('Failed to fetch dashboard stats');
    }

    return {
      openOs: openRes.count ?? 0,
      inProgressOs: inProgressRes.count ?? 0,
      completedOs: completedRes.count ?? 0,
      overdueOs: overdueRes.count ?? 0,
    };
  }

  // ------------------------------------------------------------------
  // OS per month (last 12 months)
  // ------------------------------------------------------------------

  /**
   * Returns the number of service orders created in each of the last 12
   * months.  Since Supabase JS doesn't support GROUP BY, we fetch all
   * orders from the last 12 months and aggregate in code.
   */
  async getOsPerMonth(userId: string, userRole: UserRole) {
    const supabase = this.supabaseService.getClient();

    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const fromDate = twelveMonthsAgo.toISOString();

    const partnerId = await this.resolvePartnerId(userId, userRole);

    let query = supabase
      .from('service_orders')
      .select('created_at')
      .gte('created_at', fromDate)
      .order('created_at', { ascending: true });

    if (userRole === UserRole.PARTNER && partnerId) {
      query = query.eq('partner_id', partnerId);
    } else if (userRole === UserRole.TECHNICIAN) {
      query = query.eq('technician_id', userId);
    }

    const { data, error } = await query;

    if (error) {
      this.logger.error(`Failed to fetch OS per month: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch OS per month');
    }

    // Build a map with keys "YYYY-MM" -> count
    const countMap: Record<string, number> = {};

    // Pre-fill with zeroes for all 12 months so the response is always complete
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      countMap[key] = 0;
    }

    // Tally
    for (const row of data || []) {
      const d = new Date(row.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (key in countMap) {
        countMap[key]++;
      }
    }

    // Convert to array with Portuguese month names
    return Object.entries(countMap).map(([key, count]) => {
      const [, monthStr] = key.split('-');
      const monthIndex = parseInt(monthStr, 10) - 1;
      return {
        month: MONTH_NAMES_PT[monthIndex],
        count,
      };
    });
  }

  // ------------------------------------------------------------------
  // Recent activity
  // ------------------------------------------------------------------

  /**
   * Returns the 5 most recent status-change entries across all service
   * orders the user has access to.
   */
  async getRecentActivity(userId: string, userRole: UserRole) {
    const supabase = this.supabaseService.getClient();

    // For non-admin roles we first need to determine the set of service
    // order IDs the user can access.
    let serviceOrderIds: string[] | null = null;

    if (userRole !== UserRole.ADMIN) {
      serviceOrderIds = await this.getAccessibleOrderIds(userId, userRole);
      if (serviceOrderIds.length === 0) {
        return [];
      }
    }

    let query = supabase
      .from('os_status_history')
      .select(
        `
        *,
        changed_by_user:profiles!os_status_history_changed_by_fkey(id, full_name, avatar_url, role)
      `,
      )
      .order('created_at', { ascending: false })
      .limit(5);

    if (serviceOrderIds) {
      query = query.in('service_order_id', serviceOrderIds);
    }

    const { data, error } = await query;

    if (error) {
      this.logger.error(`Failed to fetch recent activity: ${error.message}`);
      throw new InternalServerErrorException(
        'Failed to fetch recent activity',
      );
    }

    return data || [];
  }

  // ------------------------------------------------------------------
  // Upcoming schedules
  // ------------------------------------------------------------------

  /**
   * Returns the next 4 upcoming schedules that are not cancelled or
   * completed.
   */
  async getUpcomingSchedules(userId: string, userRole: UserRole) {
    const supabase = this.supabaseService.getClient();
    const today = new Date().toISOString().slice(0, 10);

    let query = supabase
      .from('schedules')
      .select(
        `
        *,
        service_order:service_orders!schedules_service_order_id_fkey(id, order_number, title, status),
        technician:profiles!schedules_technician_id_fkey(id, full_name, avatar_url)
      `,
      )
      .gte('date', today)
      .not('status', 'in', '("cancelled","completed")')
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(4);

    // Role-based filtering
    if (userRole === UserRole.TECHNICIAN) {
      query = query.eq('technician_id', userId);
    } else if (userRole === UserRole.PARTNER) {
      // Partners can only see schedules tied to their service orders
      const partnerId = await this.resolvePartnerId(userId, userRole);
      if (partnerId) {
        const orderIds = await this.getPartnerOrderIds(partnerId);
        if (orderIds.length === 0) {
          return [];
        }
        query = query.in('service_order_id', orderIds);
      } else {
        return [];
      }
    }
    // Admin sees all

    const { data, error } = await query;

    if (error) {
      this.logger.error(
        `Failed to fetch upcoming schedules: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to fetch upcoming schedules',
      );
    }

    return data || [];
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /**
   * Resolves the partner table ID for a user with the partner role.
   * Returns null when the user is not a partner or has no partner record.
   */
  private async resolvePartnerId(
    userId: string,
    userRole: UserRole,
  ): Promise<string | null> {
    if (userRole !== UserRole.PARTNER) return null;

    const supabase = this.supabaseService.getClient();
    const { data } = await supabase
      .from('partners')
      .select('id')
      .eq('user_id', userId)
      .single();

    return data?.id ?? null;
  }

  /**
   * Returns the IDs of service orders accessible by the given user based
   * on their role.
   */
  private async getAccessibleOrderIds(
    userId: string,
    userRole: UserRole,
  ): Promise<string[]> {
    const supabase = this.supabaseService.getClient();

    let query = supabase.from('service_orders').select('id');

    if (userRole === UserRole.PARTNER) {
      const partnerId = await this.resolvePartnerId(userId, userRole);
      if (!partnerId) return [];
      query = query.eq('partner_id', partnerId);
    } else if (userRole === UserRole.TECHNICIAN) {
      query = query.eq('technician_id', userId);
    }

    const { data, error } = await query;

    if (error) {
      this.logger.error(
        `Failed to fetch accessible order IDs: ${error.message}`,
      );
      return [];
    }

    return (data || []).map((row) => row.id);
  }

  /**
   * Returns all service order IDs that belong to the given partner.
   */
  private async getPartnerOrderIds(partnerId: string): Promise<string[]> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('service_orders')
      .select('id')
      .eq('partner_id', partnerId);

    if (error) {
      this.logger.error(
        `Failed to fetch partner order IDs: ${error.message}`,
      );
      return [];
    }

    return (data || []).map((row) => row.id);
  }
}
