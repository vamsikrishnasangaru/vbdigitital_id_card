import { IsString, IsOptional, IsEmail, IsBoolean, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTeacherDto {
  @ApiProperty()
  @IsString()
  firstName: string;

  @ApiProperty()
  @IsString()
  lastName: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty()
  @IsString()
  password?: string;
  
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  schoolId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  classId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  sectionId?: string;
}

export class UpdateTeacherDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional()
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  password?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  classId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  sectionId?: string;
}
