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
import { ToolsService } from './tools.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole, ToolStatus } from '../common/types/database.types';
import {
  CreateToolDto,
  UpdateToolDto,
  CheckoutToolDto,
  CheckinToolDto,
} from './dto';

@ApiTags('Tools')
@Controller('tools')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ToolsController {
  constructor(private readonly toolsService: ToolsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER)
  @ApiOperation({ summary: 'List tools inventory with pagination and filters' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name, description, or serial number' })
  @ApiQuery({ name: 'status', required: false, enum: ToolStatus, description: 'Filter by tool status' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (1-based)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page', example: 20 })
  @ApiResponse({ status: 200, description: 'Tools retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(
    @Query('search') search?: string,
    @Query('status') status?: ToolStatus,
    @Query('category') category?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.toolsService.findAllTools({
      search,
      status,
      category,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get('custody/active')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  @ApiOperation({ summary: 'Get all active tool custodies (not yet returned)' })
  @ApiQuery({ name: 'user_id', required: false, description: 'Filter by user ID' })
  @ApiResponse({ status: 200, description: 'Active custodies retrieved successfully' })
  async getActiveCustodies(@Query('user_id') userId?: string) {
    return this.toolsService.getActiveCustodies(userId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER)
  @ApiOperation({ summary: 'Get a tool by ID with current custody info' })
  @ApiParam({ name: 'id', description: 'Tool UUID' })
  @ApiResponse({ status: 200, description: 'Tool retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Tool not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.toolsService.findOneTool(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new tool in inventory' })
  @ApiResponse({ status: 201, description: 'Tool created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async create(@Body() createDto: CreateToolDto) {
    return this.toolsService.createTool(createDto);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a tool in inventory' })
  @ApiParam({ name: 'id', description: 'Tool UUID' })
  @ApiResponse({ status: 200, description: 'Tool updated successfully' })
  @ApiResponse({ status: 404, description: 'Tool not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateToolDto,
  ) {
    return this.toolsService.updateTool(id, updateDto);
  }

  @Post(':id/checkout')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  @ApiOperation({ summary: 'Checkout a tool to the current user' })
  @ApiParam({ name: 'id', description: 'Tool UUID' })
  @ApiResponse({ status: 201, description: 'Tool checked out successfully' })
  @ApiResponse({ status: 400, description: 'Tool not available for checkout' })
  @ApiResponse({ status: 404, description: 'Tool not found' })
  async checkout(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() checkoutDto: CheckoutToolDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.toolsService.checkoutTool(
      id,
      userId,
      checkoutDto.service_order_id,
      checkoutDto.expected_return_at,
      checkoutDto.condition_out,
      checkoutDto.notes,
    );
  }

  @Post('custody/:custodyId/checkin')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  @ApiOperation({ summary: 'Check in a tool from a custody record' })
  @ApiParam({ name: 'custodyId', description: 'Custody record UUID' })
  @ApiResponse({ status: 201, description: 'Tool checked in successfully' })
  @ApiResponse({ status: 400, description: 'Tool already checked in' })
  @ApiResponse({ status: 404, description: 'Custody record not found' })
  async checkin(
    @Param('custodyId', ParseUUIDPipe) custodyId: string,
    @Body() checkinDto: CheckinToolDto,
  ) {
    return this.toolsService.checkinTool(
      custodyId,
      checkinDto.condition_in,
      checkinDto.notes,
    );
  }

  @Get(':id/history')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  @ApiOperation({ summary: 'Get custody history for a tool' })
  @ApiParam({ name: 'id', description: 'Tool UUID' })
  @ApiResponse({ status: 200, description: 'Custody history retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Tool not found' })
  async getCustodyHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.toolsService.getCustodyHistory(id);
  }
}
