import { ApiPropertyOptional } from '@nestjs/swagger';
import { Allow, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSiteContentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  heroTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(800)
  heroSubtitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  stats?: { label: string; value: string }[];

  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  howItWorks?: { title: string; body: string }[];

  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  generationSteps?: { title: string; body: string }[];

  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  media?: {
    id: string;
    kind: 'image' | 'video';
    url: string;
    caption: string;
    placement: 'gallery' | 'info';
  }[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  ctaLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  moreInfoTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1200)
  moreInfoIntro?: string;
}
