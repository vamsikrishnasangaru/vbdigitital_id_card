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
import * as fs from 'fs';
import * as path from 'path';
import { UploadsService } from './uploads.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const UPLOAD_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Cross-Origin-Resource-Policy': 'cross-origin',
} as const;

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
    return this.sendUploadFile(relative, res);
  }

  /** Fallback file serve when static middleware misses (nested template/school paths). */
  @Get('*path')
  @ApiOperation({ summary: 'Serve uploaded file by relative path' })
  serveByPath(@Param('path') filePath: string | string[], @Res() res: Response) {
    const relative = Array.isArray(filePath) ? filePath.join('/') : filePath;
    if (!relative || relative.startsWith('by-name/')) {
      throw new NotFoundException('Upload path required');
    }
    return this.sendUploadFile(relative, res);
  }

  private sendUploadFile(relative: string, res: Response) {
    const safe = relative.replace(/\\/g, '/').replace(/^\/+/, '');
    const absolute = path.join(this.uploadsService.getUploadDir(), safe);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      throw new NotFoundException(`Upload not found: ${safe}`);
    }
    return res.sendFile(absolute, { headers: UPLOAD_HEADERS });
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
