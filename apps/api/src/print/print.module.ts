import { Module } from '@nestjs/common';
import { PrintController } from './print.controller';
import { PrintService } from './print.service';
import { DriveModule } from '../drive/drive.module';
import { IdCardsModule } from '../id-cards/id-cards.module';

@Module({
  imports: [DriveModule, IdCardsModule],
  controllers: [PrintController],
  providers: [PrintService],
  exports: [PrintService],
})
export class PrintModule {}
