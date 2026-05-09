import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LearningService } from './learning.service';
import type { LearningCategory } from './learning.service';

@ApiTags('Aprendizado')
@Controller('learning')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LearningController {
  constructor(private readonly learningService: LearningService) {}

  @Get('content')
  @ApiOperation({
    summary: 'Lista conteúdo de aprendizado (filtrado por categoria opcional)',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: ['INSTALACAO', 'PERICIA', 'FERRAMENTAS', 'BOAS_PRATICAS'],
  })
  @ApiResponse({ status: 200, description: 'Conteúdo retornado' })
  async list(@Query('category') category?: LearningCategory) {
    return this.learningService.listContent(category);
  }
}
