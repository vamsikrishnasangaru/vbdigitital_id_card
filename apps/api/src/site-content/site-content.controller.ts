import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UploadsService } from '../uploads/uploads.service';
import { SiteContentService } from './site-content.service';
import { UpdateSiteContentDto } from './dto/update-site-content.dto';

@ApiTags('Site content')
@Controller('site-content')
export class SiteContentController {
  constructor(
    private siteContent: SiteContentService,
    private uploads: UploadsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Public landing and more-info content' })
  getPublic() {
    return this.siteContent.getPublic();
  }

  @Put()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update landing copy (Super Admin)' })
  update(@Body() dto: UpdateSiteContentDto) {
    return this.siteContent.upsert(dto);
  }

  @Post('media')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Upload a demo image or video for the landing page' })
  async addMedia(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { caption?: string; placement?: 'gallery' | 'info' },
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const isVideo = file.mimetype.startsWith('video/');
    const isImage = file.mimetype.startsWith('image/');
    if (!isVideo && !isImage) {
      throw new BadRequestException('Upload an image or video file');
    }
    const url = await this.uploads.saveFile(file, 'landing');
    return this.siteContent.addMedia({
      id: randomUUID(),
      kind: isVideo ? 'video' : 'image',
      url,
      caption: (body.caption || '').trim(),
      placement: body.placement === 'info' ? 'info' : 'gallery',
    });
  }

  @Delete('media/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a demo media item' })
  removeMedia(@Param('id') id: string) {
    return this.siteContent.removeMedia(id);
  }
}
