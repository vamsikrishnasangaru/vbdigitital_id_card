import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { UploadsModule } from '../uploads/uploads.module';
import { ClassesModule } from '../classes/classes.module';

@Module({
  imports: [UploadsModule, ClassesModule],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}

