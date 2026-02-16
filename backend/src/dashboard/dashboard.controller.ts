import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/types/database.types';

@ApiTags('Dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get aggregated service-order statistics' })
  @ApiResponse({ status: 200, description: 'Stats retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getStats(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.dashboardService.getStats(userId, userRole);
  }

  @Get('os-per-month')
  @ApiOperation({
    summary: 'Get service-order counts per month for the last 12 months',
  })
  @ApiResponse({
    status: 200,
    description: 'OS per month retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getOsPerMonth(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.dashboardService.getOsPerMonth(userId, userRole);
  }

  @Get('recent-activity')
  @ApiOperation({ summary: 'Get the 5 most recent status-change activities' })
  @ApiResponse({
    status: 200,
    description: 'Recent activity retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getRecentActivity(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.dashboardService.getRecentActivity(userId, userRole);
  }

  @Get('upcoming-schedules')
  @ApiOperation({ summary: 'Get the next 4 upcoming schedules' })
  @ApiResponse({
    status: 200,
    description: 'Upcoming schedules retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUpcomingSchedules(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.dashboardService.getUpcomingSchedules(userId, userRole);
  }
}
