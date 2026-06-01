import {
  Controller,
  Post,
  Get,
  Param,
  NotFoundException,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Query,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import type { Response } from 'express';
import * as path from 'path';
import { UploadsService } from './uploads.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private uploadsService: UploadsService) {}

  /** Public: legacy bare filenames (e.g. 1780298562990-iy37do.jpeg) stored without /uploads/ prefix. */
  @Get('by-name/:filename')
  @ApiOperation({ summary: 'Resolve and serve upload by filename only' })
  serveByBasename(@Param('filename') filename: string, @Res() res: Response) {
    const relative = this.uploadsService.findRelativeByBasename(filename);
    if (!relative) {
      throw new NotFoundException(`Upload not found: ${filename}`);
    }
    const absolute = path.join(process.cwd(), 'uploads', relative);
    return res.sendFile(absolute, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    });
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload a file' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async upload(@UploadedFile() file: Express.Multer.File, @Query('dir') dir?: string) {
    console.log('[UploadsController] Received file:', file ? {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      hasBuffer: !!file.buffer
    } : 'null');

    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const url = await this.uploadsService.saveFile(file, dir || 'general');
    return { url, filename: file.originalname, size: file.size };
  }
}
