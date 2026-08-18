import { Module } from '@nestjs/common';
import { SiteContentController } from './site-content.controller';
import { SiteContentService } from './site-content.service';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [UploadsModule],
  controllers: [SiteContentController],
  providers: [SiteContentService],
})
export class SiteContentModule {}
