import { join } from 'path';
import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TeachersModule } from './teachers/teachers.module';
import { SchoolsModule } from './schools/schools.module';
import { ClassesModule } from './classes/classes.module';
import { StudentsModule } from './students/students.module';
import { TemplatesModule } from './templates/templates.module';
import { OrdersModule } from './orders/orders.module';
import { PrintModule } from './print/print.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UploadsModule } from './uploads/uploads.module';
import { IdCardsModule } from './id-cards/id-cards.module';
import { DriveModule } from './drive/drive.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(process.cwd(), '.env'),
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/api/v1/uploads',
      serveStaticOptions: {
        setHeaders(res) {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        },
      },
    }),
    PrismaModule,
    AuthModule,
    TeachersModule,
    SchoolsModule,
    ClassesModule,
    StudentsModule,
    TemplatesModule,
    OrdersModule,
    PrintModule,
    DeliveriesModule,
    AnalyticsModule,
    NotificationsModule,
    UploadsModule,
    IdCardsModule,
    DriveModule,
  ],
})
export class AppModule {}

