import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, ArrayMinSize } from 'class-validator';

export enum IdCardGenerateDestination {
  DOWNLOAD = 'download',
  DRIVE = 'drive',
}

export class GenerateIdCardsDto {
  @IsString()
  @IsNotEmpty()
  templateId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  studentIds: string[];

  @IsOptional()
  @IsEnum(IdCardGenerateDestination)
  destination?: IdCardGenerateDestination;
}
