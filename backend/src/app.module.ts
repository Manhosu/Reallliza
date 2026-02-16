import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ServiceOrdersModule } from './service-orders/service-orders.module';
import { ToolsModule } from './tools/tools.module';
import { SchedulesModule } from './schedules/schedules.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PartnersModule } from './partners/partners.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ChecklistsModule } from './checklists/checklists.module';
import { PhotosModule } from './photos/photos.module';
import { ReportsModule } from './reports/reports.module';
import { AuditModule } from './audit/audit.module';
import { LgpdModule } from './lgpd/lgpd.module';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';

@Module({
  imports: [
    // Global configuration from .env files
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Rate limiting: 60 requests per 60 seconds per IP
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 60,
      },
    ]),

    // Core modules
    SupabaseModule,

    // Global modules
    AuditModule,

    // Feature modules
    AuthModule,
    UsersModule,
    ServiceOrdersModule,
    ToolsModule,
    SchedulesModule,
    NotificationsModule,
    PartnersModule,
    DashboardModule,
    ChecklistsModule,
    PhotosModule,
    ReportsModule,
    LgpdModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global audit interceptor - attaches IP and User-Agent to every request
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
