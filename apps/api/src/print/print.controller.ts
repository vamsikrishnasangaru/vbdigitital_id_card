import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrintService } from './print.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Print Queue')
@Controller('print')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PrintController {
  constructor(private printService: PrintService) {}

  @Post('batch')
  @ApiOperation({ summary: 'Create print batch' })
  createBatch(@Body() body: any) { return this.printService.createBatch(body); }

  @Get()
  @ApiOperation({ summary: 'List print batches' })
  findAll(
    @Query('schoolId') schoolId?: string, @Query('status') status?: string,
    @Query('page') page?: string, @Query('limit') limit?: string,
  ) {
    return this.printService.findAll({ schoolId, status, page: page ? +page : 1, limit: limit ? +limit : 20 });
  }

  @Post(':id/generate-pdf')
  @ApiOperation({ summary: 'Generate aggregated A4 PDF for batch' })
  generatePdf(@Param('id') id: string) {
    return this.printService.generateBatchPdf(id);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Update print batch status' })
  updateStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.printService.updateStatus(id, body.status);
  }
}
