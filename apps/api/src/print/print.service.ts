import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DriveService } from '../drive/drive.service';
import { IdCardRendererService } from '../id-cards/id-card-renderer.service';

@Injectable()
export class PrintService {
  private readonly logger = new Logger(PrintService.name);

  constructor(
    private prisma: PrismaService,
    private driveService: DriveService,
    private rendererService: IdCardRendererService
  ) {}

  async createBatch(data: { schoolId: string; orderId?: string; totalCards: number; notes?: string }) {
    const batchNumber = `PB-${Date.now().toString(36).toUpperCase()}`;
    return this.prisma.printBatch.create({
      data: { ...data, batchNumber },
      include: { school: true, order: true },
    });
  }

  async generateBatchPdf(batchId: string) {
    const batch = await this.prisma.printBatch.findUnique({
      where: { id: batchId },
      include: { school: true, order: true }
    });

    if (!batch) throw new NotFoundException('Print batch not found');
    if (!batch.orderId) throw new NotFoundException('Batch not linked to an order');

    await this.updateStatus(batchId, 'PRINTING');

    try {
      this.logger.log(`Generating aggregated A4 PDF for batch ${batch.batchNumber}...`);
      const pdfBuffer = await this.rendererService.renderBatchPdf(batch.orderId);

      const fileName = `${batch.batchNumber}_A4_Sheets.pdf`;
      this.logger.log(`Uploading ${fileName} to Drive...`);

      const driveFileId = await this.driveService.uploadFile(
        fileName,
        'application/pdf',
        pdfBuffer,
        ['VB Digital ID Cards', batch.school.name, 'Print Batches']
      );

      await this.prisma.printBatch.update({
        where: { id: batchId },
        data: { 
          status: 'COMPLETED',
          pdfUrl: driveFileId, // Or the actual URL if we have a way to resolve it
          completedAt: new Date()
        }
      });

      return { driveFileId };
    } catch (error: any) {
      this.logger.error(`Failed to generate batch PDF: ${error.message}`);
      await this.updateStatus(batchId, 'FAILED');
      throw error;
    }
  }

  async findAll(query: { schoolId?: string; status?: string; page?: number; limit?: number }) {
    const { schoolId, status, page = 1, limit = 20 } = query;
    const where: any = {};
    if (schoolId) where.schoolId = schoolId;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.printBatch.findMany({
        where,
        include: { school: { select: { id: true, name: true } }, order: { select: { id: true, orderNumber: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.printBatch.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateStatus(id: string, status: string) {
    const update: any = { status };
    if (status === 'PRINTING') update.startedAt = new Date();
    if (status === 'COMPLETED') update.completedAt = new Date();
    return this.prisma.printBatch.update({ where: { id }, data: update });
  }
}
