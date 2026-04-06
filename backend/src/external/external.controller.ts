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
  constructor(private readonly externalService: ExternalService) {}

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
}
