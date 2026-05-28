import { IsString, IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export enum TemplateOrientation {
  HORIZONTAL = 'HORIZONTAL',
  VERTICAL = 'VERTICAL',
}

export class CreateTemplateDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Short code unique within the school (e.g. STD-2026)' })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  schoolId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  frontBgUrl?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  backBgUrl?: string;

  /** JSON array of designer elements or empty array on create */
  @ApiPropertyOptional()
  @IsOptional()
  frontConfig?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  backConfig?: unknown;

  @ApiPropertyOptional({ enum: TemplateOrientation })
  @IsEnum(TemplateOrientation)
  @IsOptional()
  orientation?: TemplateOrientation;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class UpdateTemplateDto extends PartialType(CreateTemplateDto) {}
