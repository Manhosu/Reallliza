import {
  Controller,
  Get,
  Post,
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
import { ProposalsService } from './proposals.service';
import { CreateProposalDto, RespondProposalDto, ListProposalsDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/types/database.types';

@ApiTags('Proposals')
@Controller('proposals')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ProposalsController {
  constructor(private readonly proposalsService: ProposalsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  @ApiOperation({ summary: 'Lista propostas (técnico: apenas as suas + abertas; admin: todas)' })
  @ApiResponse({ status: 200, description: 'Propostas retornadas' })
  async findAll(
    @Query() filters: ListProposalsDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.proposalsService.findAll(filters, userId, userRole);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  @ApiOperation({ summary: 'Busca proposta por ID' })
  @ApiParam({ name: 'id', description: 'Proposal UUID' })
  @ApiResponse({ status: 200, description: 'Proposta retornada' })
  @ApiResponse({ status: 404, description: 'Não encontrada' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.proposalsService.findOne(id, userId, userRole);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Cria nova proposta (admin only)' })
  @ApiResponse({ status: 201, description: 'Proposta criada' })
  @ApiResponse({ status: 400, description: 'OS inválida ou finalizada' })
  async create(
    @Body() dto: CreateProposalDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.proposalsService.create(dto, userId);
  }

  @Post(':id/respond')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  @ApiOperation({ summary: 'Técnico responde à proposta (aceitar ou rejeitar)' })
  @ApiParam({ name: 'id', description: 'Proposal UUID' })
  @ApiResponse({ status: 200, description: 'Resposta registrada' })
  @ApiResponse({ status: 400, description: 'Proposta não está pendente ou expirou' })
  @ApiResponse({ status: 403, description: 'Proposta não é para este técnico' })
  async respond(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RespondProposalDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.proposalsService.respond(id, dto, userId, userRole);
  }
}
