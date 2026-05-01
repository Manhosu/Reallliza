import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { ToolRequestsService } from './tool-requests.service';
import { CreateToolRequestDto, RejectToolRequestDto } from './dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/types/database.types';

@ApiTags('Tool Requests')
@Controller('tools/requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ToolRequestsController {
  constructor(private readonly service: ToolRequestsService) {}

  @Post()
  @Roles(UserRole.TECHNICIAN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Solicita uma ferramenta' })
  async create(
    @Body() dto: CreateToolRequestDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.create(userId, dto);
  }

  @Get('my')
  @Roles(UserRole.TECHNICIAN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Minhas solicitações' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'approved', 'released', 'rejected', 'cancelled'],
  })
  async listMine(@CurrentUser('id') userId: string, @Query('status') status?: string) {
    return this.service.listMine(userId, status as never);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: lista todas as solicitações' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'approved', 'released', 'rejected', 'cancelled'],
  })
  async listAll(@Query('status') status?: string) {
    return this.service.listAll(status as never);
  }

  @Patch(':id/approve')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin aprova a solicitação' })
  @ApiParam({ name: 'id', description: 'Tool request UUID' })
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.approve(id, userId);
  }

  @Patch(':id/reject')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin rejeita a solicitação' })
  @ApiParam({ name: 'id', description: 'Tool request UUID' })
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectToolRequestDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.reject(id, userId, dto.reason);
  }

  @Patch(':id/release')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin libera a ferramenta para retirada' })
  @ApiParam({ name: 'id', description: 'Tool request UUID' })
  async release(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.release(id, userId);
  }

  @Patch(':id/cancel')
  @Roles(UserRole.TECHNICIAN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Técnico cancela própria solicitação pendente' })
  @ApiParam({ name: 'id', description: 'Tool request UUID' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.cancel(id, userId);
  }
}
