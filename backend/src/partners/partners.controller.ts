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
import { PartnersService } from './partners.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/types/database.types';
import {
  ListPartnersDto,
  CreatePartnerDto,
  UpdatePartnerDto,
} from './dto';

@ApiTags('Partners')
@Controller('partners')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.PARTNER)
  @ApiOperation({
    summary: 'List partners with pagination and filters',
  })
  @ApiResponse({
    status: 200,
    description: 'Partners retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(@Query() filters: ListPartnersDto) {
    return this.partnersService.findAll(filters);
  }

  @Get(':id/service-orders')
  @Roles(UserRole.ADMIN, UserRole.PARTNER)
  @ApiOperation({
    summary: 'List service orders for a specific partner',
  })
  @ApiParam({ name: 'id', description: 'Partner UUID' })
  @ApiResponse({
    status: 200,
    description: 'Partner service orders retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Partner not found' })
  async getServiceOrders(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: any,
  ) {
    return this.partnersService.getServiceOrders(id, query);
  }

  @Get(':id/stats')
  @Roles(UserRole.ADMIN, UserRole.PARTNER)
  @ApiOperation({ summary: 'Get statistics for a partner' })
  @ApiParam({ name: 'id', description: 'Partner UUID' })
  @ApiResponse({
    status: 200,
    description: 'Partner stats retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Partner not found' })
  async getStats(@Param('id', ParseUUIDPipe) id: string) {
    return this.partnersService.getStats(id);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.PARTNER)
  @ApiOperation({ summary: 'Get a partner by ID' })
  @ApiParam({ name: 'id', description: 'Partner UUID' })
  @ApiResponse({
    status: 200,
    description: 'Partner retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Partner not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.partnersService.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new partner' })
  @ApiResponse({
    status: 201,
    description: 'Partner created successfully',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async create(
    @Body() createDto: CreatePartnerDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.partnersService.create(createDto, userId);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a partner' })
  @ApiParam({ name: 'id', description: 'Partner UUID' })
  @ApiResponse({
    status: 200,
    description: 'Partner updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Partner not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdatePartnerDto,
  ) {
    return this.partnersService.update(id, updateDto);
  }

  @Patch(':id/activate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Activate a partner' })
  @ApiParam({ name: 'id', description: 'Partner UUID' })
  @ApiResponse({
    status: 200,
    description: 'Partner activated successfully',
  })
  @ApiResponse({ status: 400, description: 'Partner is already active' })
  @ApiResponse({ status: 404, description: 'Partner not found' })
  async activate(@Param('id', ParseUUIDPipe) id: string) {
    return this.partnersService.activate(id);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Deactivate a partner' })
  @ApiParam({ name: 'id', description: 'Partner UUID' })
  @ApiResponse({
    status: 200,
    description: 'Partner deactivated successfully',
  })
  @ApiResponse({ status: 400, description: 'Partner is already inactive' })
  @ApiResponse({ status: 404, description: 'Partner not found' })
  async deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.partnersService.deactivate(id);
  }
}
