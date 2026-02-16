import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { NotificationType } from '../common/types/database.types';
import { DevicePlatform } from './dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  // ============================================================
  // Device Token Management
  // ============================================================

  /**
   * Registers a device token for push notifications.
   * If the token already exists for this user, it updates the platform and timestamp.
   */
  async registerDevice(
    userId: string,
    token: string,
    platform: DevicePlatform,
  ) {
    const supabase = this.supabaseService.getClient();

    // Upsert: if token already exists for this user, update it
    const { data: existing } = await supabase
      .from('device_tokens')
      .select('id')
      .eq('user_id', userId)
      .eq('token', token)
      .maybeSingle();

    if (existing) {
      const { data: updated, error } = await supabase
        .from('device_tokens')
        .update({
          platform,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        this.logger.error(
          `Failed to update device token for user ${userId}: ${error.message}`,
        );
        throw new InternalServerErrorException(
          'Failed to register device token',
        );
      }

      return updated;
    }

    const { data: device, error } = await supabase
      .from('device_tokens')
      .insert({
        user_id: userId,
        token,
        platform,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(
        `Failed to register device token for user ${userId}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to register device token',
      );
    }

    return device;
  }

  /**
   * Removes a device token for a user (e.g., on logout).
   */
  async removeDevice(userId: string, token: string) {
    const supabase = this.supabaseService.getClient();

    const { error } = await supabase
      .from('device_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('token', token);

    if (error) {
      this.logger.error(
        `Failed to remove device token for user ${userId}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to remove device token',
      );
    }

    return { message: 'Device token removed successfully' };
  }

  /**
   * Sends a push notification to all registered devices of a user
   * via the Expo Push API.
   */
  async sendPushNotification(
    userId: string,
    title: string,
    message: string,
    data?: Record<string, unknown>,
  ) {
    const supabase = this.supabaseService.getClient();

    // Get all device tokens for the user
    const { data: devices, error } = await supabase
      .from('device_tokens')
      .select('token')
      .eq('user_id', userId);

    if (error) {
      this.logger.error(
        `Failed to fetch device tokens for user ${userId}: ${error.message}`,
      );
      return;
    }

    if (!devices || devices.length === 0) {
      this.logger.debug(`No device tokens found for user ${userId}`);
      return;
    }

    // Build messages for Expo Push API
    const messages = devices.map((device) => ({
      to: device.token,
      title,
      body: message,
      data: data || {},
      sound: 'default' as const,
    }));

    try {
      const response = await fetch(
        'https://exp.host/--/api/v2/push/send',
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(messages),
        },
      );

      if (!response.ok) {
        this.logger.error(
          `Expo Push API returned status ${response.status}`,
        );
      } else {
        this.logger.debug(
          `Push notification sent to ${devices.length} device(s) for user ${userId}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to send push notification: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ============================================================
  // Notification CRUD
  // ============================================================

  /**
   * Retrieves paginated notifications for a user, ordered by most recent first.
   */
  async findAllForUser(userId: string, page: number = 1, limit: number = 20) {
    const supabase = this.supabaseService.getClient();
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      this.logger.error(
        `Failed to fetch notifications for user ${userId}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to fetch notifications',
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
   * Marks a single notification as read.
   * Verifies the notification belongs to the specified user.
   */
  async markAsRead(id: string, userId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: notification, error: findError } = await supabase
      .from('notifications')
      .select('id, user_id, read_at')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (findError || !notification) {
      throw new NotFoundException(`Notification with ID ${id} not found`);
    }

    // Already read
    if (notification.read_at) {
      return notification;
    }

    const { data: updated, error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      this.logger.error(
        `Failed to mark notification ${id} as read: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to mark notification as read',
      );
    }

    return updated;
  }

  /**
   * Marks all notifications as read for a user.
   */
  async markAllAsRead(userId: string) {
    const supabase = this.supabaseService.getClient();

    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null);

    if (error) {
      this.logger.error(
        `Failed to mark all notifications as read for user ${userId}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to mark all notifications as read',
      );
    }

    return { message: 'All notifications marked as read' };
  }

  /**
   * Gets the count of unread notifications for a user.
   */
  async getUnreadCount(userId: string) {
    const supabase = this.supabaseService.getClient();

    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null);

    if (error) {
      this.logger.error(
        `Failed to get unread count for user ${userId}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to get unread notification count',
      );
    }

    return { unread_count: count || 0 };
  }

  /**
   * Creates a new notification (for internal use by other services).
   * Also sends a push notification to the user's devices.
   */
  async create(
    userId: string,
    title: string,
    message: string,
    type: NotificationType,
    data?: Record<string, unknown>,
  ) {
    const supabase = this.supabaseService.getClient();

    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        title,
        message,
        type,
        data: data || null,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(
        `Failed to create notification for user ${userId}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to create notification',
      );
    }

    // Fire-and-forget push notification
    this.sendPushNotification(userId, title, message, data || undefined).catch(
      (err) => {
        this.logger.error(
          `Failed to send push notification: ${err instanceof Error ? err.message : String(err)}`,
        );
      },
    );

    return notification;
  }
}
