import { Controller, Get, Post, Body, UseGuards, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { IdCardsService } from './id-cards.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
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
          'Content-Disposition': `attachment; filename="${pack.filename}"`,
          'X-Cards-Success': String(pack.successCount),
          'X-Cards-Failed': String(pack.failCount),
        });
        return res.send(pack.buffer);
      }

      if ('kind' in pack && pack.kind === 'zip') {
        res.set({
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${pack.filename}"`,
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

  @Get()
  @Roles('SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'List generated ID cards' })
  findAll(@Query('studentId') studentId?: string, @Query('status') status?: string) {
    return this.idCardsService.findAll({ studentId, status });
  }
}
