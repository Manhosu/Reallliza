import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Get,
  Param,
  HttpCode,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiHeader,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { ExternalService } from './external.service';
import { CreateExternalOsDto } from './dto';
import { MessagesService } from '../messages/messages.service';
import { IngestExternalMessageDto } from '../messages/dto';
import { SyncService } from './sync.service';
import { SyncFeedPostDto, SyncLearningContentDto, SyncRatingDto } from './sync-feed.dto';

interface ApiKeyRequest extends Request {
  apiKeySystem?: string;
}

@ApiTags('External Integration')
@Controller('external')
@UseGuards(ApiKeyGuard)
@ApiSecurity('api-key')
@ApiHeader({
  name: 'X-API-Key',
  required: true,
  description: 'API Key for the external system (e.g. GARANTIAS)',
})
export class ExternalController {
  constructor(
    private readonly externalService: ExternalService,
    private readonly messagesService: MessagesService,
    private readonly syncService: SyncService,
  ) {}

  @Post('service-orders')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Create a service order from an external system (e.g. Garantias)',
  })
  @ApiResponse({ status: 201, description: 'Service order created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Invalid or missing API Key' })
  @ApiResponse({
    status: 403,
    description: 'API key system does not match payload external_system',
  })
  @ApiResponse({
    status: 409,
    description: 'Service order already exists for this external_id',
  })
  async createExternalOs(
    @Body() dto: CreateExternalOsDto,
    @Req() req: ApiKeyRequest,
  ) {
    return this.externalService.createFromExternal(dto, req.apiKeySystem!);
  }

  @Get('service-orders/by-external/:externalSystem/:externalId')
  @ApiOperation({
    summary: 'Look up a service order by (external_system, external_id)',
  })
  @ApiResponse({ status: 200, description: 'Found' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async getByExternalId(
    @Param('externalSystem') externalSystem: string,
    @Param('externalId') externalId: string,
  ) {
    return this.externalService.findByExternalId(externalSystem, externalId);
  }

  @Post('messages')
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Recebe mensagem de chat enviada pelo Garantias (operador → técnico)',
  })
  @ApiResponse({ status: 201, description: 'Mensagem replicada' })
  @ApiResponse({ status: 404, description: 'Service order not found' })
  async ingestMessage(@Body() dto: IngestExternalMessageDto) {
    return this.messagesService.ingestExternalMessage(dto);
  }

  @Post('feed-posts')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Sincroniza posts do Feed gerenciados pelo Garantias',
  })
  @ApiResponse({ status: 200, description: 'Post sincronizado' })
  async syncFeedPost(@Body() dto: SyncFeedPostDto) {
    return this.syncService.upsertFeedPost(dto, null);
  }

  @Post('learning-content')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Sincroniza conteúdo de Aprendizado gerenciado pelo Garantias',
  })
  @ApiResponse({ status: 200, description: 'Conteúdo sincronizado' })
  async syncLearning(@Body() dto: SyncLearningContentDto) {
    return this.syncService.upsertLearningContent(dto);
  }

  @Post('ratings')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Recebe avaliação do cliente vinda do Garantias',
  })
  @ApiResponse({ status: 200, description: 'Avaliação registrada' })
  async syncRating(@Body() dto: SyncRatingDto) {
    return this.syncService.upsertRating(dto);
  }
}
