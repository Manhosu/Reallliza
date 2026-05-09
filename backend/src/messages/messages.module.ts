import { Module, forwardRef } from '@nestjs/common';
import { MessagesController, ChatOverviewController } from './messages.controller';
import { MessagesService } from './messages.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ExternalModule } from '../external/external.module';

@Module({
  imports: [AuthModule, NotificationsModule, forwardRef(() => ExternalModule)],
  controllers: [MessagesController, ChatOverviewController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
