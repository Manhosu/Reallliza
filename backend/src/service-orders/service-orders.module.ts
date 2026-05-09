import { Module, forwardRef } from '@nestjs/common';
import { ServiceOrdersController } from './service-orders.controller';
import { ServiceOrdersService } from './service-orders.service';
import { StepsController } from './steps/steps.controller';
import { StepsService } from './steps/steps.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ExternalModule } from '../external/external.module';
import { SchedulesModule } from '../schedules/schedules.module';

@Module({
  imports: [AuthModule, NotificationsModule, ExternalModule, forwardRef(() => SchedulesModule)],
  controllers: [ServiceOrdersController, StepsController],
  providers: [ServiceOrdersService, StepsService],
  exports: [ServiceOrdersService, StepsService],
})
export class ServiceOrdersModule {}
