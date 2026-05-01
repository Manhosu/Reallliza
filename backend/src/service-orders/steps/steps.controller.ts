import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { StepsService } from './steps.service';
import { CompleteStepDto } from './dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/types/database.types';

@ApiTags('OS Steps (Etapas Obrigatórias)')
@Controller('service-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class StepsController {
  constructor(private readonly stepsService: StepsService) {}

  @Get(':id/steps')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER)
  @ApiOperation({
    summary:
      'Lista as etapas obrigatórias da OS (cria a partir do template se ainda não existirem)',
  })
  @ApiParam({ name: 'id', description: 'Service order UUID' })
  @ApiResponse({ status: 200, description: 'Etapas retornadas' })
  async getSteps(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.stepsService.getStepsForOrder(id, userId);
  }

  @Post(':id/steps/:stepId/start')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  @ApiOperation({ summary: 'Inicia uma etapa' })
  @ApiResponse({ status: 200, description: 'Etapa iniciada' })
  @ApiResponse({
    status: 400,
    description: 'Etapa anterior não foi concluída',
  })
  async start(
    @Param('id', ParseUUIDPipe) _id: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.stepsService.startStep(stepId, userId);
  }

  @Post(':id/steps/:stepId/complete')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  @ApiOperation({ summary: 'Conclui uma etapa após validar requisitos' })
  @ApiResponse({ status: 200, description: 'Etapa concluída' })
  @ApiResponse({
    status: 400,
    description: 'Requisitos não atendidos (fotos mínimas, observações, etc)',
  })
  async complete(
    @Param('id', ParseUUIDPipe) _id: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body() dto: CompleteStepDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.stepsService.completeStep(stepId, userId, dto);
  }
}
