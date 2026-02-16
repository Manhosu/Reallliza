import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
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
} from '@nestjs/swagger';
import { ServiceOrdersService } from './service-orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/types/database.types';
import {
  ListServiceOrdersDto,
  CreateServiceOrderDto,
  UpdateServiceOrderDto,
  ChangeStatusDto,
} from './dto';

@ApiTags('Service Orders')
@Controller('service-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ServiceOrdersController {
  constructor(
    private readonly serviceOrdersService: ServiceOrdersService,
  ) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER)
  @ApiOperation({
    summary: 'List service orders with pagination and filters',
  })
  @ApiResponse({
    status: 200,
    description: 'Service orders retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(
    @Query() filters: ListServiceOrdersDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.serviceOrdersService.findAll(filters, userId, userRole);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER)
  @ApiOperation({ summary: 'Get a service order by ID' })
  @ApiParam({ name: 'id', description: 'Service order UUID' })
  @ApiResponse({
    status: 200,
    description: 'Service order retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Service order not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.serviceOrdersService.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.PARTNER)
  @ApiOperation({ summary: 'Create a new service order' })
  @ApiResponse({
    status: 201,
    description: 'Service order created successfully',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async create(
    @Body() createDto: CreateServiceOrderDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.serviceOrdersService.create(createDto, userId);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.PARTNER)
  @ApiOperation({ summary: 'Update a service order' })
  @ApiParam({ name: 'id', description: 'Service order UUID' })
  @ApiResponse({
    status: 200,
    description: 'Service order updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Service order not found' })
  @ApiResponse({
    status: 400,
    description: 'Cannot update completed/cancelled order',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateServiceOrderDto,
  ) {
    return this.serviceOrdersService.update(id, updateDto);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER)
  @ApiOperation({ summary: 'Change service order status' })
  @ApiParam({ name: 'id', description: 'Service order UUID' })
  @ApiResponse({
    status: 200,
    description: 'Status changed successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 404, description: 'Service order not found' })
  async changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changeStatusDto: ChangeStatusDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.serviceOrdersService.changeStatus(
      id,
      changeStatusDto.status,
      userId,
      changeStatusDto.notes,
      changeStatusDto.version,
    );
  }

  @Get(':id/timeline')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER)
  @ApiOperation({ summary: 'Get status history timeline for a service order' })
  @ApiParam({ name: 'id', description: 'Service order UUID' })
  @ApiResponse({
    status: 200,
    description: 'Timeline retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Service order not found' })
  async getTimeline(@Param('id', ParseUUIDPipe) id: string) {
    return this.serviceOrdersService.getTimeline(id);
  }
}
