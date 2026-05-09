import {
  Controller,
  Get,
  Post,
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
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/types/database.types';

@ApiTags('OS Messages (Chat)')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
@Controller('messages')
export class ChatOverviewController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('chats')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lista todas as OS com mensagens (central de chats)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Chats ativos retornados' })
  async listChats(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.messagesService.listActiveChats(page ? +page : 1, limit ? +limit : 30);
  }
}

@ApiTags('OS Messages (Chat)')
@Controller('service-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get(':id/messages')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER)
  @ApiOperation({ summary: 'Lista mensagens da OS (chat operacional)' })
  @ApiParam({ name: 'id', description: 'Service order UUID' })
  @ApiResponse({ status: 200, description: 'Mensagens retornadas' })
  async list(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messagesService.listMessages(id, userId);
  }

  @Post(':id/messages')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.PARTNER)
  @ApiOperation({ summary: 'Envia mensagem na OS' })
  @ApiResponse({ status: 201, description: 'Mensagem enviada' })
  async send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMessageDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
    @CurrentUser('full_name') fullName: string,
  ) {
    return this.messagesService.createMessage(
      id,
      userId,
      role,
      fullName || 'Usuário',
      dto,
    );
  }
}
