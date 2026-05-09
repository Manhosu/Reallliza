import { Module } from '@nestjs/common';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [ProposalsController],
  providers: [ProposalsService],
  exports: [ProposalsService],
})
export class ProposalsModule {}
