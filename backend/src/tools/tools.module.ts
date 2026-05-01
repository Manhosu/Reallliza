import { Module } from '@nestjs/common';
import { ToolsController } from './tools.controller';
import { ToolsService } from './tools.service';
import { ToolRequestsController } from './requests/tool-requests.controller';
import { ToolRequestsService } from './requests/tool-requests.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [ToolsController, ToolRequestsController],
  providers: [ToolsService, ToolRequestsService],
  exports: [ToolsService, ToolRequestsService],
})
export class ToolsModule {}
