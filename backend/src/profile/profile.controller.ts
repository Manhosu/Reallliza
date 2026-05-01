import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { ProfileService } from './profile.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  address?: string;
}

@ApiTags('Profile')
@Controller('profile')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  @ApiOperation({ summary: 'Retorna o perfil do usuário autenticado' })
  @ApiResponse({ status: 200 })
  async getMe(@CurrentUser('id') userId: string) {
    return this.profileService.getProfile(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Atualiza o perfil do usuário autenticado' })
  @ApiResponse({ status: 200 })
  async updateMe(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profileService.updateProfile(userId, dto);
  }

  @Get('me/performance')
  @ApiOperation({
    summary:
      'Métricas de desempenho do técnico (manual seção 13: nota média, total de avaliações, serviços concluídos)',
  })
  @ApiResponse({ status: 200 })
  async myPerformance(@CurrentUser('id') userId: string) {
    return this.profileService.getPerformance(userId);
  }
}
