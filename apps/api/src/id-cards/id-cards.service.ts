import {
  Injectable,
  BadRequestException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DriveService } from '../drive/drive.service';
import { IdCardRendererService } from './id-card-renderer.service';
import { AuthService } from '../auth/auth.service';
import { Orientation } from '@prisma/client';
import { IdCardGenerateDestination } from './dto/generate-id-cards.dto';
import { buildIdCardsZip, idCardFileBaseName } from './id-cards-download.util';

type StudentWithRelations = {
  id: string;
  admissionNumber: string;
  rollNumber: string | null;
  firstName: string;
  lastName: string;
  school?: { name: string } | null;
  class?: { name: string } | null;
  section?: { name: string; class?: { name: string; school?: { name: string } } | null } | null;
};

@Injectable()
export class IdCardsService {
  private readonly logger = new Logger(IdCardsService.name);

  constructor(
    private prisma: PrismaService,
    private driveService: DriveService,
    private rendererService: IdCardRendererService,
    private authService: AuthService,
  ) {}

  getDriveStatus() {
    return {
      configured: this.driveService.isDriveEnabled(),
      canUpload: this.driveService.canUploadToDrive(),
    };
  }

  async generate(
    templateId: string,
    studentIds: string[],
    destination: IdCardGenerateDestination,
  ) {
    if (!templateId || !studentIds?.length) {
      throw new BadRequestException('Template ID and Student IDs are required');
    }

    if (destination === IdCardGenerateDestination.DRIVE) {
      if (!this.driveService.canUploadToDrive()) {
        throw new ServiceUnavailableException(
          'Google Drive upload is not configured. Set GOOGLE_DRIVE_OAUTH_* in the API environment, or choose Download instead.',
        );
      }
      return this.generateToDrive(templateId, studentIds);
    }

    return this.generateDownloadPack(templateId, studentIds);
  }

  private async generateDownloadPack(templateId: string, studentIds: string[]) {
    const template = await this.loadTemplate(templateId);
    const renderToken = this.authService.createRenderToken();
    const files: { name: string; buffer: Buffer }[] = [];
    const errors: { studentId: string; error: string }[] = [];

    for (let i = 0; i < studentIds.length; i++) {
      const studentId = studentIds[i];
      try {
        const student = await this.loadStudent(studentId);
        await this.ensureIdCardRecord(studentId, templateId);
        const pngBuffer = await this.rendererService.renderCard(
          templateId,
          studentId,
          renderToken,
          template.orientation as Orientation,
        );
        files.push({
          name: `${idCardFileBaseName(student)}.png`,
          buffer: pngBuffer,
        });
        await this.prisma.idCard.updateMany({
          where: { studentId, templateId },
          data: { status: 'PRINTED' },
        });
        if (i < studentIds.length - 1) {
          await new Promise((r) => setTimeout(r, 300));
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Download render failed for ${studentId}: ${message}`);
        errors.push({ studentId, error: message });
      }
    }

    if (files.length === 0) {
      throw new BadRequestException(
        errors[0]?.error || 'Failed to generate any ID card images',
      );
    }

    const stamp = new Date().toISOString().slice(0, 10);
    if (files.length === 1) {
      return {
        kind: 'single' as const,
        filename: files[0].name,
        buffer: files[0].buffer,
        successCount: 1,
        failCount: errors.length,
        errors,
      };
    }

    const zipBuffer = await buildIdCardsZip(files);
    return {
      kind: 'zip' as const,
      filename: `id-cards_${stamp}.zip`,
      buffer: zipBuffer,
      successCount: files.length,
      failCount: errors.length,
      errors,
    };
  }

  private async generateToDrive(templateId: string, studentIds: string[]) {
    const template = await this.loadTemplate(templateId);
    const renderToken = this.authService.createRenderToken();
    const results: {
      studentId: string;
      status: string;
      error?: string;
      driveFileId?: string;
    }[] = [];

    for (let i = 0; i < studentIds.length; i++) {
      const studentId = studentIds[i];
      try {
        await this.ensureIdCardRecord(studentId, templateId);
        const student = await this.loadStudent(studentId);
        const schoolName = student.school?.name || student.section?.class?.school?.name || 'School';
        const className = student.class?.name || student.section?.class?.name || 'Class';
        const sectionName = student.section?.name || 'Section';

        const pngBuffer = await this.rendererService.renderCard(
          templateId,
          studentId,
          renderToken,
          template.orientation as Orientation,
        );

        const fileName = `${idCardFileBaseName(student)}.png`;
        let driveFileId: string | undefined;

        try {
          driveFileId = await this.driveService.uploadFile(
            fileName,
            'image/png',
            pngBuffer,
            [schoolName, className, sectionName],
          );
        } catch (driveErr: unknown) {
          const driveMessage =
            driveErr instanceof Error ? driveErr.message : 'Google Drive upload failed';
          this.logger.warn(`Drive upload failed for ${fileName}: ${driveMessage}`);
          results.push({ studentId, status: 'FAILED', error: driveMessage });
          continue;
        }

        await this.prisma.idCard.updateMany({
          where: { studentId, templateId },
          data: { status: 'PRINTED' },
        });

        results.push({ studentId, status: 'SUCCESS', driveFileId });
        if (i < studentIds.length - 1) {
          await new Promise((r) => setTimeout(r, 300));
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`ID card render failed for student ${studentId}: ${message}`);
        results.push({ studentId, status: 'FAILED', error: message });
      }
    }

    const successCount = results.filter((r) => r.status === 'SUCCESS').length;
    const failCount = results.filter((r) => r.status === 'FAILED').length;

    return {
      message:
        failCount === 0
          ? `Generated ${successCount} ID card(s) and uploaded to Google Drive`
          : `Uploaded ${successCount} to Google Drive, ${failCount} failed`,
      successCount,
      failCount,
      results,
    };
  }

  private async loadTemplate(templateId: string) {
    const template = await this.prisma.template.findFirst({
      where: { id: templateId, deletedAt: null, isActive: true },
    });
    if (!template) throw new BadRequestException('Template not found');

    const bg = template.frontBgUrl?.trim();
    if (!bg) {
      this.logger.warn(
        `Template ${templateId} has no frontBgUrl. Set a background image under Templates → Replace background.`,
      );
    } else if (!bg.startsWith('color:') && !bg.startsWith('gradient:')) {
      this.logger.log(`Template ${templateId} background image path: ${bg}`);
    }

    return template;
  }

  private async loadStudent(studentId: string): Promise<StudentWithRelations> {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      include: {
        section: { include: { class: { include: { school: true } } } },
        class: true,
        school: true,
      },
    });
    if (!student) throw new BadRequestException(`Student not found: ${studentId}`);
    return student;
  }

  private async ensureIdCardRecord(studentId: string, templateId: string) {
    const existing = await this.prisma.idCard.findFirst({
      where: { studentId, templateId },
    });
    if (existing) {
      await this.prisma.idCard.update({
        where: { id: existing.id },
        data: { status: 'DESIGNING' },
      });
      return;
    }
    await this.prisma.idCard.create({
      data: { studentId, templateId, status: 'DESIGNING' },
    });
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
