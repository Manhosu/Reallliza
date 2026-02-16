import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/types/database.types';
import { RegisterDeviceDto, RemoveDeviceDto } from './dto';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  // ============================================================
  // Device Token Endpoints
  // ============================================================

  @Post('register-device')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER)
  @ApiOperation({ summary: 'Register a device for push notifications' })
  @ApiResponse({ status: 201, description: 'Device registered successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async registerDevice(
    @CurrentUser('id') userId: string,
    @Body() dto: RegisterDeviceDto,
  ) {
    return this.notificationsService.registerDevice(
      userId,
      dto.token,
      dto.platform,
    );
  }

  @Delete('remove-device')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER)
  @ApiOperation({ summary: 'Remove a device from push notifications' })
  @ApiResponse({ status: 200, description: 'Device removed successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async removeDevice(
    @CurrentUser('id') userId: string,
    @Body() dto: RemoveDeviceDto,
  ) {
    return this.notificationsService.removeDevice(userId, dto.token);
  }

  // ============================================================
  // Notification Endpoints
  // ============================================================

  @Get()
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER)
  @ApiOperation({ summary: 'Get current user notifications with pagination' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (1-based)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', example: 20 })
  @ApiResponse({ status: 200, description: 'Notifications retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.findAllForUser(
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('unread-count')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER)
  @ApiOperation({ summary: 'Get unread notification count for current user' })
  @ApiResponse({ status: 200, description: 'Unread count retrieved successfully' })
  async getUnreadCount(@CurrentUser('id') userId: string) {
    return this.notificationsService.getUnreadCount(userId);
  }

  @Patch('read-all')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER)
  @ApiOperation({ summary: 'Mark all notifications as read for current user' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  async markAllAsRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllAsRead(userId);
  }

  @Patch(':id/read')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER)
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.notificationsService.markAsRead(id, userId);
  }
}
