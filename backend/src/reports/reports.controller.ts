import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import * as express from 'express';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/types/database.types';
import {
  OsByPeriodDto,
  OsByTechnicianDto,
  OsByPartnerDto,
  ToolsCustodyDto,
  FinancialDto,
  AuditLogDto,
} from './dto';

@ApiTags('Reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('os-by-period')
  @ApiOperation({ summary: 'Generate OS report by period (PDF or Excel)' })
  @ApiResponse({ status: 200, description: 'Report file download' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  async osByPeriod(
    @Query() query: OsByPeriodDto,
    @Res() res: express.Response,
  ): Promise<void> {
    const result = await this.reportsService.generateOsByPeriod(
      query,
      query.format || 'pdf',
    );
    res.set({
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Content-Length': String(result.buffer.length),
    });
    res.send(result.buffer);
  }

  @Get('os-by-technician')
  @ApiOperation({
    summary: 'Generate OS report grouped by technician (PDF or Excel)',
  })
  @ApiResponse({ status: 200, description: 'Report file download' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  async osByTechnician(
    @Query() query: OsByTechnicianDto,
    @Res() res: express.Response,
  ): Promise<void> {
    const result = await this.reportsService.generateOsByTechnician(
      query,
      query.format || 'pdf',
    );
    res.set({
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Content-Length': String(result.buffer.length),
    });
    res.send(result.buffer);
  }

  @Get('os-by-partner')
  @ApiOperation({
    summary: 'Generate OS report grouped by partner (PDF or Excel)',
  })
  @ApiResponse({ status: 200, description: 'Report file download' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  async osByPartner(
    @Query() query: OsByPartnerDto,
    @Res() res: express.Response,
  ): Promise<void> {
    const result = await this.reportsService.generateOsByPartner(
      query,
      query.format || 'pdf',
    );
    res.set({
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Content-Length': String(result.buffer.length),
    });
    res.send(result.buffer);
  }

  @Get('tools-custody')
  @ApiOperation({
    summary: 'Generate tools custody report (PDF or Excel)',
  })
  @ApiResponse({ status: 200, description: 'Report file download' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  async toolsCustody(
    @Query() query: ToolsCustodyDto,
    @Res() res: express.Response,
  ): Promise<void> {
    const result = await this.reportsService.generateToolsCustody(
      query,
      query.format || 'pdf',
    );
    res.set({
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Content-Length': String(result.buffer.length),
    });
    res.send(result.buffer);
  }

  @Get('financial')
  @ApiOperation({
    summary: 'Generate financial summary report (PDF or Excel)',
  })
  @ApiResponse({ status: 200, description: 'Report file download' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  async financial(
    @Query() query: FinancialDto,
    @Res() res: express.Response,
  ): Promise<void> {
    const result = await this.reportsService.generateFinancial(
      query,
      query.format || 'pdf',
    );
    res.set({
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Content-Length': String(result.buffer.length),
    });
    res.send(result.buffer);
  }

  @Get('audit')
  @ApiOperation({
    summary: 'Generate audit log report (PDF or Excel)',
  })
  @ApiResponse({ status: 200, description: 'Report file download' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  async audit(
    @Query() query: AuditLogDto,
    @Res() res: express.Response,
  ): Promise<void> {
    const result = await this.reportsService.generateAuditLog(
      query,
      query.format || 'pdf',
    );
    res.set({
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Content-Length': String(result.buffer.length),
    });
    res.send(result.buffer);
  }
}
