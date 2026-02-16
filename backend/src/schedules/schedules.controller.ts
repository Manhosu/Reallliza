import {
  Controller,
  Get,
  Post,
  Put,
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
import { SchedulesService } from './schedules.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/types/database.types';
import {
  ListSchedulesDto,
  CreateScheduleDto,
  UpdateScheduleDto,
} from './dto';

@ApiTags('Schedules')
@Controller('schedules')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER)
  @ApiOperation({ summary: 'List schedules with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Schedules retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(@Query() filters: ListSchedulesDto) {
    return this.schedulesService.findAll(filters);
  }

  @Get('technician/:technicianId')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  @ApiOperation({ summary: 'Get schedules for a technician within a date range' })
  @ApiParam({ name: 'technicianId', description: 'Technician UUID' })
  @ApiQuery({ name: 'week_start', required: true, description: 'Start date (ISO 8601)', example: '2025-07-14' })
  @ApiQuery({ name: 'week_end', required: true, description: 'End date (ISO 8601)', example: '2025-07-20' })
  @ApiResponse({ status: 200, description: 'Technician schedules retrieved successfully' })
  async getByTechnician(
    @Param('technicianId', ParseUUIDPipe) technicianId: string,
    @Query('week_start') weekStart: string,
    @Query('week_end') weekEnd: string,
  ) {
    return this.schedulesService.getByTechnician(
      technicianId,
      weekStart,
      weekEnd,
    );
  }

  @Get('date/:date')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER)
  @ApiOperation({ summary: 'Get all schedules for a specific date' })
  @ApiParam({ name: 'date', description: 'Date (YYYY-MM-DD)', example: '2025-07-15' })
  @ApiResponse({ status: 200, description: 'Schedules for date retrieved successfully' })
  async getByDate(@Param('date') date: string) {
    return this.schedulesService.getByDate(date);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER)
  @ApiOperation({ summary: 'Get a schedule by ID' })
  @ApiParam({ name: 'id', description: 'Schedule UUID' })
  @ApiResponse({ status: 200, description: 'Schedule retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Schedule not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.schedulesService.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new schedule' })
  @ApiResponse({ status: 201, description: 'Schedule created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error or time conflict' })
  async create(
    @Body() createDto: CreateScheduleDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.schedulesService.create(createDto, userId);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a schedule' })
  @ApiParam({ name: 'id', description: 'Schedule UUID' })
  @ApiResponse({ status: 200, description: 'Schedule updated successfully' })
  @ApiResponse({ status: 404, description: 'Schedule not found' })
  @ApiResponse({ status: 400, description: 'Time conflict detected' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateScheduleDto,
  ) {
    return this.schedulesService.update(id, updateDto);
  }
}
