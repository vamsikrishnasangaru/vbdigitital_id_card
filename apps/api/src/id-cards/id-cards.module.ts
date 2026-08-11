import { Module } from '@nestjs/common';
import { IdCardsService } from './id-cards.service';
import { IdCardsController } from './id-cards.controller';
import { DriveModule } from '../drive/drive.module';
import { IdCardRendererService } from './id-card-renderer.service';
import { IdCardsGenerateJobsService } from './id-cards-generate-jobs.service';
import { GenerateJobAccessGuard } from './guards/generate-job-access.guard';
import { AuthModule } from '../auth/auth.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [DriveModule, AuthModule, UploadsModule],
  controllers: [IdCardsController],
  providers: [IdCardsService, IdCardRendererService, IdCardsGenerateJobsService, GenerateJobAccessGuard],
  exports: [IdCardsService, IdCardRendererService],
})
export class IdCardsModule {}
