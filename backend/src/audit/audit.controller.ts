import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/types/database.types';

@ApiTags('Audit')
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Search audit logs with filters (Admin only)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', example: 20 })
  @ApiQuery({ name: 'date_from', required: false, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'date_to', required: false, description: 'End date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'action', required: false, description: 'Action type filter' })
  @ApiQuery({ name: 'entity_type', required: false, description: 'Entity type filter' })
  @ApiQuery({ name: 'user_id', required: false, description: 'User ID filter' })
  @ApiResponse({ status: 200, description: 'Audit logs retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  async search(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('action') action?: string,
    @Query('entity_type') entityType?: string,
    @Query('user_id') userId?: string,
  ) {
    return this.auditService.search(
      {
        date_from: dateFrom,
        date_to: dateTo,
        action,
        entity_type: entityType,
        user_id: userId,
      },
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('entity/:type/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get audit trail for a specific entity (Admin only)' })
  @ApiParam({ name: 'type', description: 'Entity type (e.g., service_order, user)' })
  @ApiParam({ name: 'id', description: 'Entity ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Audit trail retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  async getByEntity(
    @Param('type') type: string,
    @Param('id') id: string,
  ) {
    return this.auditService.getByEntity(type, id);
  }
}
