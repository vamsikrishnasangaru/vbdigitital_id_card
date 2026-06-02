import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@vbdigital.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Admin@123' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'admin@vbdigital.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Admin@123' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'Admin' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'User' })
  @IsString()
  @IsNotEmpty()
  lastName: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  newPassword: string;
}

export class UpdateProfileDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  firstName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lastName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;
}
