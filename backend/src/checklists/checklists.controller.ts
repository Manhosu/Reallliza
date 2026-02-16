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
import { ChecklistsService } from './checklists.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/types/database.types';
import {
  ListTemplatesDto,
  CreateTemplateDto,
  UpdateTemplateDto,
  CreateChecklistDto,
  UpdateChecklistItemsDto,
  CompleteChecklistDto,
} from './dto';

@ApiTags('Checklists')
@Controller('checklists')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ChecklistsController {
  constructor(private readonly checklistsService: ChecklistsService) {}

  // ============================================================
  // Template endpoints (admin only)
  // ============================================================

  @Get('templates')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List checklist templates with pagination and filters' })
  @ApiResponse({
    status: 200,
    description: 'Templates retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin only' })
  async findAllTemplates(@Query() filters: ListTemplatesDto) {
    return this.checklistsService.findAllTemplates(filters);
  }

  @Get('templates/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get a checklist template by ID' })
  @ApiParam({ name: 'id', description: 'Template UUID' })
  @ApiResponse({
    status: 200,
    description: 'Template retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async findOneTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.checklistsService.findOneTemplate(id);
  }

  @Post('templates')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new checklist template' })
  @ApiResponse({
    status: 201,
    description: 'Template created successfully',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async createTemplate(
    @Body() createDto: CreateTemplateDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.checklistsService.createTemplate(createDto, userId);
  }

  @Put('templates/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a checklist template' })
  @ApiParam({ name: 'id', description: 'Template UUID' })
  @ApiResponse({
    status: 200,
    description: 'Template updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async updateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateTemplateDto,
  ) {
    return this.checklistsService.updateTemplate(id, updateDto);
  }

  @Patch('templates/:id/deactivate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Deactivate a checklist template' })
  @ApiParam({ name: 'id', description: 'Template UUID' })
  @ApiResponse({
    status: 200,
    description: 'Template deactivated successfully',
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async deactivateTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.checklistsService.deactivateTemplate(id);
  }

  // ============================================================
  // Checklist endpoints
  // ============================================================

  @Get('service-order/:serviceOrderId')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  @ApiOperation({ summary: 'Get all checklists for a service order' })
  @ApiParam({ name: 'serviceOrderId', description: 'Service order UUID' })
  @ApiResponse({
    status: 200,
    description: 'Checklists retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Service order not found' })
  async findByServiceOrder(
    @Param('serviceOrderId', ParseUUIDPipe) serviceOrderId: string,
  ) {
    return this.checklistsService.findByServiceOrder(serviceOrderId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  @ApiOperation({ summary: 'Get a checklist by ID' })
  @ApiParam({ name: 'id', description: 'Checklist UUID' })
  @ApiResponse({
    status: 200,
    description: 'Checklist retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Checklist not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.checklistsService.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  @ApiOperation({ summary: 'Create a checklist from a template' })
  @ApiResponse({
    status: 201,
    description: 'Checklist created successfully',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Service order or template not found' })
  async create(
    @Body() createDto: CreateChecklistDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.checklistsService.createFromTemplate(
      createDto.service_order_id,
      createDto.template_id,
      userId,
    );
  }

  @Put(':id/items')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  @ApiOperation({ summary: 'Update checklist items / save progress' })
  @ApiParam({ name: 'id', description: 'Checklist UUID' })
  @ApiResponse({
    status: 200,
    description: 'Checklist items updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Cannot update completed checklist' })
  @ApiResponse({ status: 404, description: 'Checklist not found' })
  async updateItems(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateChecklistItemsDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.checklistsService.updateItems(id, updateDto, userId);
  }

  @Patch(':id/complete')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  @ApiOperation({ summary: 'Mark a checklist as completed' })
  @ApiParam({ name: 'id', description: 'Checklist UUID' })
  @ApiResponse({
    status: 200,
    description: 'Checklist completed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Required items not checked or already completed',
  })
  @ApiResponse({ status: 404, description: 'Checklist not found' })
  async completeChecklist(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() completeDto: CompleteChecklistDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.checklistsService.completeChecklist(id, userId, completeDto.version);
  }
}
