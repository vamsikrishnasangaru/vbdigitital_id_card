import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DuplicateTemplateDto {
  @ApiProperty({ description: 'School that will own the new template' })
  @IsString()
  targetSchoolId: string;

  @ApiProperty({ example: 'Student ID Card 2026' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ example: 'DEMO-STD-01', description: 'Unique template code within the target school' })
  @IsString()
  @MinLength(1)
  code: string;
}
