import { Injectable, BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DriveService } from '../drive/drive.service';
import { IdCardRendererService } from './id-card-renderer.service';
import { AuthService } from '../auth/auth.service';
import { UploadsService } from '../uploads/uploads.service';
import { Orientation } from '@prisma/client';

@Injectable()
export class IdCardsService {
  private readonly logger = new Logger(IdCardsService.name);

  constructor(
    private prisma: PrismaService,
    private driveService: DriveService,
    private rendererService: IdCardRendererService,
    private authService: AuthService,
    private uploadsService: UploadsService,
  ) {}

  async generate(templateId: string, studentIds: string[]) {
    if (!templateId || !studentIds?.length) {
      throw new BadRequestException('Template ID and Student IDs are required');
    }

    if (!this.driveService.isDriveEnabled()) {
      throw new ServiceUnavailableException(
        'Google Drive is not configured. Set GOOGLE_DRIVE_OAUTH_* (personal Gmail) or GOOGLE_DRIVE_CREDENTIALS (Workspace shared drives).',
      );
    }

    const template = await this.prisma.template.findFirst({
      where: { id: templateId, deletedAt: null, isActive: true },
    });
    if (!template) throw new BadRequestException('Template not found');

    const renderToken = this.authService.createRenderToken();
    const results: { studentId: string; status: string; error?: string; pdfUrl?: string; driveFileId?: string }[] = [];

    for (const studentId of studentIds) {
      try {
        let card = await this.prisma.idCard.findFirst({
          where: { studentId, templateId },
          include: {
            student: {
              include: {
                section: { include: { class: { include: { school: true } } } },
                class: true,
                school: true,
              },
            },
          },
        });

        if (!card) {
          card = await this.prisma.idCard.create({
            data: { studentId, templateId, status: 'DESIGNING' },
            include: {
              student: {
                include: {
                  section: { include: { class: { include: { school: true } } } },
                  class: true,
                  school: true,
                },
              },
            },
          });
        } else {
          await this.prisma.idCard.update({
            where: { id: card.id },
            data: { status: 'DESIGNING' },
          });
        }

        const student = card.student;
        const schoolName = student.school?.name || student.section?.class?.school?.name || 'School';
        const className = student.class?.name || student.section?.class?.name || 'Class';
        const sectionName = student.section?.name || 'Section';

        this.logger.log(`Rendering ID card for student ${studentId}...`);
        const pdfBuffer = await this.rendererService.renderCardPdf(
          templateId,
          studentId,
          renderToken,
          template.orientation as Orientation,
        );

        const fileName = `${student.admissionNumber}_${student.firstName}_${student.lastName}.pdf`.replace(/\s+/g, '_');
        let pdfUrl: string | undefined;
        let driveFileId: string | undefined;

        if (this.driveService.isDriveEnabled()) {
          try {
            driveFileId = await this.driveService.uploadFile(
              fileName,
              'application/pdf',
              pdfBuffer,
              [schoolName, className, sectionName],
            );
          } catch (driveErr: unknown) {
            const driveMessage =
              driveErr instanceof Error ? driveErr.message : 'Google Drive upload failed';
            this.logger.warn(`Drive upload failed for ${fileName}: ${driveMessage}`);
            results.push({
              studentId,
              status: 'FAILED',
              error: driveMessage,
            });
            continue;
          }
        }
        if (!driveFileId) {
          results.push({
            studentId,
            status: 'FAILED',
            error: 'Google Drive upload failed — card was not saved',
          });
          continue;
        }

        await this.prisma.idCard.update({
          where: { id: card.id },
          data: {
            status: 'PRINTED',
            pdfUrl: pdfUrl || undefined,
          },
        });

        results.push({ studentId, status: 'SUCCESS', pdfUrl, driveFileId });
      } catch (error: any) {
        this.logger.error(`Failed to generate ID card for student ${studentId}: ${error.message}`);
        results.push({ studentId, status: 'FAILED', error: error.message });
      }
    }

    const successCount = results.filter((r) => r.status === 'SUCCESS').length;
    const failCount = results.filter((r) => r.status === 'FAILED').length;
    const driveCount = results.filter((r) => r.driveFileId).length;

    return {
      message:
        failCount === 0
          ? `Generated ${successCount} ID card(s) and uploaded to Google Drive`
          : `Uploaded ${driveCount} to Google Drive, ${failCount} failed`,
      successCount,
      failCount,
      results,
    };
  }

  async findAll(query: { studentId?: string; status?: string }) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (query.studentId) where.studentId = query.studentId;
    if (query.status) where.status = query.status;

    return this.prisma.idCard.findMany({
      where,
      include: {
        student: { select: { firstName: true, lastName: true, admissionNumber: true } },
        template: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
