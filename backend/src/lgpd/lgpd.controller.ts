import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
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
import { LgpdService } from './lgpd.service';
import { UpdateConsentDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/types/database.types';

@ApiTags('LGPD')
@Controller('lgpd')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class LgpdController {
  constructor(private readonly lgpdService: LgpdService) {}

  @Get('my-data')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER)
  @ApiOperation({ summary: 'Download all personal data (LGPD data portability)' })
  @ApiResponse({ status: 200, description: 'User data exported as JSON' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async exportMyData(@CurrentUser('id') userId: string) {
    return this.lgpdService.exportUserData(userId);
  }

  @Post('anonymize-request')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER)
  @ApiOperation({ summary: 'Request data anonymization (creates pending request)' })
  @ApiResponse({ status: 201, description: 'Anonymization request created' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async requestAnonymization(@CurrentUser('id') userId: string) {
    return this.lgpdService.createAnonymizationRequest(userId);
  }

  @Post('anonymize/:userId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Execute user data anonymization (Admin only)' })
  @ApiParam({ name: 'userId', description: 'User ID to anonymize' })
  @ApiResponse({ status: 200, description: 'User data anonymized successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async anonymizeUser(
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.lgpdService.anonymizeUser(userId);
  }

  @Get('consent')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER)
  @ApiOperation({ summary: 'Get current user consent status' })
  @ApiResponse({ status: 200, description: 'Consent status retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getConsent(@CurrentUser('id') userId: string) {
    return this.lgpdService.getConsentStatus(userId);
  }

  @Put('consent')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER)
  @ApiOperation({ summary: 'Update consent preferences' })
  @ApiResponse({ status: 200, description: 'Consent updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateConsent(
    @CurrentUser('id') userId: string,
    @Body() consent: UpdateConsentDto,
  ) {
    return this.lgpdService.updateConsent(userId, consent);
  }
}
