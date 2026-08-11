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
import { IdCardsGenerateJobsService } from './id-cards-generate-jobs.service';
import { Orientation } from '@prisma/client';
import { IdCardGenerateDestination } from './dto/generate-id-cards.dto';
import { buildIdCardsZip, buildIdCardsZipFilename, idCardFileBaseName, idCardZipEntryPath } from './id-cards-download.util';

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
    private generateJobs: IdCardsGenerateJobsService,
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

  startDownloadGenerate(templateId: string, studentIds: string[]) {
    if (!templateId || !studentIds?.length) {
      throw new BadRequestException('Template ID and Student IDs are required');
    }
    const { jobId, pollToken } = this.generateJobs.createJob(studentIds.length);
    void this.runDownloadGenerateJob(jobId, templateId, studentIds);
    return { jobId, pollToken, total: studentIds.length };
  }

  getDownloadGenerateJob(jobId: string) {
    const job = this.generateJobs.getJob(jobId);
    if (!job) throw new BadRequestException('Generate job not found or expired');
    return job;
  }

  consumeDownloadGenerateJob(jobId: string) {
    return this.generateJobs.consumeDownload(jobId);
  }

  private async runDownloadGenerateJob(jobId: string, templateId: string, studentIds: string[]) {
    try {
      const pack = await this.generateDownloadPack(templateId, studentIds, (completed, total) => {
        this.generateJobs.updateProgress(jobId, completed, total);
      });
      this.generateJobs.complete(jobId, {
        kind: pack.kind,
        filename: pack.filename,
        buffer: pack.buffer,
        successCount: pack.successCount,
        failCount: pack.failCount,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Download generate job ${jobId} failed: ${message}`);
      this.generateJobs.fail(jobId, message);
    }
  }

  private async generateDownloadPack(
    templateId: string,
    studentIds: string[],
    onProgress?: (completed: number, total: number) => void,
  ) {
    const template = await this.loadTemplate(templateId);
    const renderToken = this.authService.createRenderToken();
    const [rendered, studentMap] = await Promise.all([
      this.rendererService.renderCardsBatch(
        templateId,
        studentIds,
        renderToken,
        template.orientation as Orientation,
        onProgress,
      ),
      this.loadStudents(studentIds),
    ]);

    const files: { name: string; buffer: Buffer }[] = [];
    const errors: { studentId: string; error: string }[] = [];

    await Promise.all(
      rendered.map(async (result) => {
        if (!result.buffer) {
          this.logger.warn(`Download render failed for ${result.studentId}: ${result.error}`);
          errors.push({ studentId: result.studentId, error: result.error || 'Render failed' });
          return;
        }
        try {
          const student = studentMap.get(result.studentId);
          if (!student) {
            throw new BadRequestException(`Student not found: ${result.studentId}`);
          }
          await this.ensureIdCardRecord(result.studentId, templateId);
          const pngFileName = `${idCardFileBaseName(student)}.png`;
          files.push({
            name: idCardZipEntryPath(student, pngFileName),
            buffer: result.buffer,
          });
          await this.prisma.idCard.updateMany({
            where: { studentId: result.studentId, templateId },
            data: { status: 'PRINTED' },
          });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Download post-process failed for ${result.studentId}: ${message}`);
          errors.push({ studentId: result.studentId, error: message });
        }
      }),
    );

    if (files.length === 0) {
      throw new BadRequestException(
        errors[0]?.error || 'Failed to generate any ID card images',
      );
    }

    if (files.length === 1) {
      const singleName = files[0].name.split('/').pop() || files[0].name;
      return {
        kind: 'single' as const,
        filename: singleName,
        buffer: files[0].buffer,
        successCount: 1,
        failCount: errors.length,
        errors,
      };
    }

    const zipBuffer = await buildIdCardsZip(files);
    return {
      kind: 'zip' as const,
      filename: buildIdCardsZipFilename(files),
      buffer: zipBuffer,
      successCount: files.length,
      failCount: errors.length,
      errors,
    };
  }

  private async generateToDrive(templateId: string, studentIds: string[]) {
    const template = await this.loadTemplate(templateId);
    const renderToken = this.authService.createRenderToken();
    const [rendered, studentMap] = await Promise.all([
      this.rendererService.renderCardsBatch(
        templateId,
        studentIds,
        renderToken,
        template.orientation as Orientation,
      ),
      this.loadStudents(studentIds),
    ]);

    const results: {
      studentId: string;
      status: string;
      error?: string;
      driveFileId?: string;
    }[] = [];

    await Promise.all(
      rendered.map(async (result) => {
        if (!result.buffer) {
          this.logger.warn(`ID card render failed for student ${result.studentId}: ${result.error}`);
          results.push({ studentId: result.studentId, status: 'FAILED', error: result.error || 'Render failed' });
          return;
        }

        try {
          await this.ensureIdCardRecord(result.studentId, templateId);
          const student = studentMap.get(result.studentId);
          if (!student) {
            throw new BadRequestException(`Student not found: ${result.studentId}`);
          }
          const schoolName = student.school?.name || student.section?.class?.school?.name || 'School';
          const className = student.class?.name || student.section?.class?.name || 'Class';
          const sectionName = student.section?.name || 'Section';

          const fileName = `${idCardFileBaseName(student)}.png`;
          let driveFileId: string | undefined;

          try {
            driveFileId = await this.driveService.uploadFile(
              fileName,
              'image/png',
              result.buffer,
              [schoolName, className, sectionName],
            );
          } catch (driveErr: unknown) {
            const driveMessage =
              driveErr instanceof Error ? driveErr.message : 'Google Drive upload failed';
            this.logger.warn(`Drive upload failed for ${fileName}: ${driveMessage}`);
            results.push({ studentId: result.studentId, status: 'FAILED', error: driveMessage });
            return;
          }

          await this.prisma.idCard.updateMany({
            where: { studentId: result.studentId, templateId },
            data: { status: 'PRINTED' },
          });

          results.push({ studentId: result.studentId, status: 'SUCCESS', driveFileId });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`ID card post-process failed for student ${result.studentId}: ${message}`);
          results.push({ studentId: result.studentId, status: 'FAILED', error: message });
        }
      }),
    );

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

  private async loadStudents(studentIds: string[]): Promise<Map<string, StudentWithRelations>> {
    const students = await this.prisma.student.findMany({
      where: { id: { in: studentIds }, deletedAt: null },
      include: {
        section: { include: { class: { include: { school: true } } } },
        class: true,
        school: true,
      },
    });
    return new Map(students.map((student) => [student.id, student]));
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
