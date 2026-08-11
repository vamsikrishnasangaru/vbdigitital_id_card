import { Controller, Get, Post, Body, UseGuards, Query, Res, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { IdCardsService } from './id-cards.service';
import { contentDispositionAttachment } from '../common/http-filename.util';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GenerateJobAccessGuard } from './guards/generate-job-access.guard';
import { GenerateIdCardsDto, IdCardGenerateDestination } from './dto/generate-id-cards.dto';

@ApiTags('ID Cards')
@Controller('id-cards')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class IdCardsController {
  constructor(private readonly idCardsService: IdCardsService) {}

  @Get('drive-status')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Google Drive upload availability for generate flow' })
  driveStatus() {
    return this.idCardsService.getDriveStatus();
  }

  @Post('generate')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Generate ID cards — download PNG/ZIP or upload to Google Drive' })
  async generate(@Body() body: GenerateIdCardsDto, @Res() res: Response) {
    const destination = body.destination ?? IdCardGenerateDestination.DOWNLOAD;

    if (destination === IdCardGenerateDestination.DOWNLOAD) {
      const pack = await this.idCardsService.generate(
        body.templateId,
        body.studentIds,
        IdCardGenerateDestination.DOWNLOAD,
      );

      if ('kind' in pack && pack.kind === 'single') {
        res.set({
          'Content-Type': 'image/png',
          'Content-Disposition': contentDispositionAttachment(pack.filename),
          'X-Cards-Success': String(pack.successCount),
          'X-Cards-Failed': String(pack.failCount),
        });
        return res.send(pack.buffer);
      }

      if ('kind' in pack && pack.kind === 'zip') {
        res.set({
          'Content-Type': 'application/zip',
          'Content-Disposition': contentDispositionAttachment(pack.filename),
          'X-Cards-Success': String(pack.successCount),
          'X-Cards-Failed': String(pack.failCount),
        });
        return res.send(pack.buffer);
      }
    }

    const result = await this.idCardsService.generate(
      body.templateId,
      body.studentIds,
      IdCardGenerateDestination.DRIVE,
    );
    return res.json(result);
  }

  @Post('generate/async')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Start async ID card download job with progress polling' })
  startAsyncGenerate(@Body() body: GenerateIdCardsDto) {
    return this.idCardsService.startDownloadGenerate(body.templateId, body.studentIds);
  }

  @Get('generate/jobs/:jobId')
  @UseGuards(GenerateJobAccessGuard)
  @ApiOperation({ summary: 'Poll async ID card generate job progress' })
  getGenerateJob(@Param('jobId') jobId: string) {
    return this.idCardsService.getDownloadGenerateJob(jobId);
  }

  @Get('generate/jobs/:jobId/download')
  @UseGuards(GenerateJobAccessGuard)
  @ApiOperation({ summary: 'Download completed async ID card generate job' })
  downloadGenerateJob(@Param('jobId') jobId: string, @Res() res: Response) {
    const pack = this.idCardsService.consumeDownloadGenerateJob(jobId);
    res.set({
      'Content-Type': pack.kind === 'single' ? 'image/png' : 'application/zip',
      'Content-Disposition': contentDispositionAttachment(pack.filename),
      'X-Cards-Success': String(pack.successCount),
      'X-Cards-Failed': String(pack.failCount),
    });
    return res.send(pack.buffer);
  }

  @Get()
  @Roles('SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'List generated ID cards' })
  findAll(@Query('studentId') studentId?: string, @Query('status') status?: string) {
    return this.idCardsService.findAll({ studentId, status });
  }
}
