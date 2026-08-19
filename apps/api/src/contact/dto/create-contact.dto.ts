import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateContactDto {
  @ApiProperty({ example: 'ZPH High School' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  schoolName!: string;

  @ApiProperty({ example: '9876543210' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[\d+\-\s()]{8,20}$/, { message: 'Enter a valid mobile number' })
  mobile!: string;

  @ApiPropertyOptional({ example: 'admin@school.edu' })
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional({ example: 'We need ID cards for 800 students.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}
