import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { NotificationType } from '../common/types/database.types';
import {
  ListSchedulesDto,
  CreateScheduleDto,
  UpdateScheduleDto,
} from './dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SchedulesService {
  private readonly logger = new Logger(SchedulesService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Retrieves a paginated list of schedules with filters.
   * Includes technician and service order data.
   */
  async findAll(filters: ListSchedulesDto) {
    const supabase = this.supabaseService.getClient();
    const {
      page = 1,
      limit = 20,
      technician_id,
      date_from,
      date_to,
      status,
    } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('schedules')
      .select(
        `
        *,
        technician:profiles!schedules_technician_id_fkey(id, full_name, email, phone, avatar_url),
        service_order:service_orders!schedules_service_order_id_fkey(id, order_number, title, status, client_name, address_city)
      `,
        { count: 'exact' },
      );

    // Apply filters
    if (technician_id) {
      query = query.eq('technician_id', technician_id);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (date_from) {
      query = query.gte('date', date_from);
    }

    if (date_to) {
      query = query.lte('date', date_to);
    }

    // Pagination and ordering
    query = query
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      this.logger.error(`Failed to fetch schedules: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch schedules');
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
   * Retrieves a single schedule by ID with relations.
   */
  async findOne(id: string) {
    const supabase = this.supabaseService.getClient();

    const { data: schedule, error } = await supabase
      .from('schedules')
      .select(
        `
        *,
        technician:profiles!schedules_technician_id_fkey(id, full_name, email, phone, avatar_url, specialties),
        service_order:service_orders!schedules_service_order_id_fkey(id, order_number, title, status, priority, client_name, client_phone, address_street, address_number, address_city, address_state)
      `,
      )
      .eq('id', id)
      .single();

    if (error || !schedule) {
      throw new NotFoundException(`Schedule with ID ${id} not found`);
    }

    return schedule;
  }

  /**
   * Creates a new schedule.
   * Verifies there are no time conflicts for the technician on the same date.
   */
  async create(data: CreateScheduleDto, userId: string) {
    const supabase = this.supabaseService.getClient();

    // Check for time conflicts if start and end times are provided
    if (data.start_time && data.end_time) {
      await this.checkTimeConflict(
        data.technician_id,
        data.date,
        data.start_time,
        data.end_time,
      );
    }

    const { data: schedule, error } = await supabase
      .from('schedules')
      .insert({
        service_order_id: data.service_order_id,
        technician_id: data.technician_id,
        date: data.date,
        start_time: data.start_time,
        end_time: data.end_time,
        status: data.status,
        notes: data.notes,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create schedule: ${error.message}`);
      throw new InternalServerErrorException('Failed to create schedule');
    }

    // Notify the technician about the new schedule
    try {
      await this.notificationsService.create(
        data.technician_id,
        'Novo agendamento',
        `Novo agendamento para ${data.date}`,
        NotificationType.SCHEDULE_REMINDER,
        { schedule_id: schedule.id },
      );
    } catch {
      // Notification failure should not break the main operation
    }

    return schedule;
  }

  /**
   * Updates an existing schedule.
   */
  async update(id: string, data: UpdateScheduleDto) {
    const supabase = this.supabaseService.getClient();

    // Verify the schedule exists
    const { data: existing, error: findError } = await supabase
      .from('schedules')
      .select('id, technician_id, date')
      .eq('id', id)
      .single();

    if (findError || !existing) {
      throw new NotFoundException(`Schedule with ID ${id} not found`);
    }

    // Check for time conflicts if times are being updated
    const technicianId = data.technician_id || existing.technician_id;
    const scheduledDate = data.date || existing.date;

    if (data.start_time && data.end_time) {
      await this.checkTimeConflict(
        technicianId,
        scheduledDate,
        data.start_time,
        data.end_time,
        id, // exclude current schedule from conflict check
      );
    }

    const { data: schedule, error } = await supabase
      .from('schedules')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(
        `Failed to update schedule ${id}: ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to update schedule');
    }

    return schedule;
  }

  /**
   * Gets all schedules for a technician within a date range.
   */
  async getByTechnician(
    technicianId: string,
    weekStart: string,
    weekEnd: string,
  ) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('schedules')
      .select(
        `
        *,
        service_order:service_orders!schedules_service_order_id_fkey(id, order_number, title, status, priority, client_name, address_city)
      `,
      )
      .eq('technician_id', technicianId)
      .gte('date', weekStart)
      .lte('date', weekEnd)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) {
      this.logger.error(
        `Failed to fetch schedules for technician ${technicianId}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to fetch technician schedules',
      );
    }

    return data || [];
  }

  /**
   * Gets all schedules for a specific date.
   */
  async getByDate(date: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('schedules')
      .select(
        `
        *,
        technician:profiles!schedules_technician_id_fkey(id, full_name, email, phone, avatar_url),
        service_order:service_orders!schedules_service_order_id_fkey(id, order_number, title, status, priority, client_name, address_city)
      `,
      )
      .eq('date', date)
      .order('start_time', { ascending: true });

    if (error) {
      this.logger.error(
        `Failed to fetch schedules for date ${date}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to fetch schedules for date',
      );
    }

    return data || [];
  }

  /**
   * Checks if there are time conflicts for a technician on a given date.
   * Throws BadRequestException if a conflict is detected.
   */
  private async checkTimeConflict(
    technicianId: string,
    scheduledDate: string,
    startTime: string,
    endTime: string,
    excludeScheduleId?: string,
  ) {
    const supabase = this.supabaseService.getClient();

    let query = supabase
      .from('schedules')
      .select('id, start_time, end_time')
      .eq('technician_id', technicianId)
      .eq('date', scheduledDate)
      .not('status', 'eq', 'cancelled')
      .not('start_time', 'is', null)
      .not('end_time', 'is', null);

    if (excludeScheduleId) {
      query = query.neq('id', excludeScheduleId);
    }

    const { data: existingSchedules, error } = await query;

    if (error) {
      this.logger.error(
        `Failed to check schedule conflicts: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to check schedule conflicts',
      );
    }

    if (existingSchedules && existingSchedules.length > 0) {
      for (const existing of existingSchedules) {
        const existingStart = existing.start_time;
        const existingEnd = existing.end_time;

        if (existingStart && existingEnd) {
          // Check for overlap: new start < existing end AND new end > existing start
          if (startTime < existingEnd && endTime > existingStart) {
            throw new BadRequestException(
              `Schedule conflict detected: technician already has a schedule from ${existingStart} to ${existingEnd} on ${scheduledDate}`,
            );
          }
        }
      }
    }
  }
}
