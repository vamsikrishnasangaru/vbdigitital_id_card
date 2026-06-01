import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import {
  extractUploadRelativePath,
  normalizeConfigMediaUrls,
  normalizeStoredUploadUrl,
  uploadsFileExists,
} from '../uploads/media-url.util';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto';
import { Orientation } from '@prisma/client';

@Injectable()
export class TemplatesService {
  constructor(
    private prisma: PrismaService,
    private uploadsService: UploadsService,
    private configService: ConfigService,
  ) {}

  private normalizeCode(code?: string): string | undefined {
    const trimmed = code?.trim();
    return trimmed ? trimmed.toUpperCase() : undefined;
  }

  private async assertCodeAvailable(schoolId: string, code: string, excludeId?: string) {
    const existing = await this.prisma.template.findFirst({
      where: {
        schoolId,
        code,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existing) {
      throw new ConflictException(`Template code "${code}" is already used for this school`);
    }
  }

  private normalizeFrontConfig(config: unknown): unknown {
    if (config === undefined || config === null) return [];
    if (Array.isArray(config)) return config;
    if (typeof config === 'object' && config !== null && Array.isArray((config as { elements?: unknown }).elements)) {
      return (config as { elements: unknown }).elements;
    }
    return config;
  }

  private normalizeTemplateMedia<T extends { frontBgUrl?: string | null; backBgUrl?: string | null; frontConfig?: unknown; backConfig?: unknown }>(
    tpl: T,
  ) {
    const uploadDir = this.uploadsService.getUploadDir();
    const findByBasename = (name: string) => this.uploadsService.findRelativeByBasename(name);
    const normalized = {
      ...tpl,
      frontBgUrl: normalizeStoredUploadUrl(tpl.frontBgUrl, uploadDir, findByBasename),
      backBgUrl: normalizeStoredUploadUrl(tpl.backBgUrl, uploadDir, findByBasename),
      frontConfig: normalizeConfigMediaUrls(tpl.frontConfig, uploadDir, findByBasename),
      backConfig: normalizeConfigMediaUrls(tpl.backConfig, uploadDir, findByBasename),
    };
    return {
      ...normalized,
      frontBgMedia: this.describeBgMedia(normalized.frontBgUrl),
    };
  }

  private describeBgMedia(frontBgUrl?: string | null) {
    if (!frontBgUrl?.trim()) {
      return { configured: false, mode: 'none' as const, exists: false, path: null, publicUrl: null };
    }
    if (frontBgUrl.startsWith('color:') || frontBgUrl.startsWith('gradient:')) {
      return {
        configured: true,
        mode: frontBgUrl.startsWith('color:') ? ('solid' as const) : ('gradient' as const),
        exists: true,
        path: frontBgUrl,
        publicUrl: null,
      };
    }

    const uploadDir = this.uploadsService.getUploadDir();
    const relative = extractUploadRelativePath(frontBgUrl);
    const exists = relative ? uploadsFileExists(uploadDir, relative) : false;
    const frontend = (this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000').replace(
      /\/$/,
      '',
    );
    return {
      configured: true,
      mode: 'image' as const,
      exists,
      path: frontBgUrl,
      relative,
      publicUrl: exists && relative ? `${frontend}/api/v1/uploads/${relative}` : null,
    };
  }

  async create(dto: CreateTemplateDto) {
    if (!dto.schoolId) {
      throw new BadRequestException('schoolId is required for school templates');
    }
    const code = this.normalizeCode(dto.code);
    if (code) await this.assertCodeAvailable(dto.schoolId, code);
    return this.prisma.template.create({
      data: {
        name: dto.name.trim(),
        code,
        description: dto.description,
        schoolId: dto.schoolId,
        frontBgUrl: dto.frontBgUrl,
        backBgUrl: dto.backBgUrl,
        frontConfig: this.normalizeFrontConfig(dto.frontConfig ?? []) as object,
        backConfig: dto.backConfig as object | undefined,
        orientation: (dto.orientation as Orientation) ?? Orientation.HORIZONTAL,
        isDefault: dto.isDefault ?? false,
      },
      include: { _count: { select: { idCards: true } }, school: { select: { id: true, name: true, code: true } } },
    });
  }

  async findAll(schoolId?: string, search?: string, allSchools?: boolean) {
    const where: Record<string, unknown> = { deletedAt: null, isActive: true };
    if (!allSchools && schoolId) where.schoolId = schoolId;
    if (search?.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
        { id: { equals: q } },
        { id: { startsWith: q, mode: 'insensitive' } },
        { school: { name: { contains: q, mode: 'insensitive' } } },
        { school: { code: { contains: q, mode: 'insensitive' } } },
      ];
    }
    return this.prisma.template.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
        schoolId: true,
        frontBgUrl: true,
        backBgUrl: true,
        orientation: true,
        isDefault: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        school: { select: { id: true, name: true, code: true } },
        _count: { select: { idCards: true } },
      },
    });
  }

  async findOne(id: string) {
    const tpl = await this.prisma.template.findUnique({ where: { id } });
    if (!tpl) throw new NotFoundException('Template not found');
    return this.normalizeTemplateMedia(tpl);
  }

  async duplicate(
    id: string,
    dto: { targetSchoolId: string; name: string; code: string },
  ) {
    const source = await this.prisma.template.findUnique({
      where: { id, deletedAt: null },
    });
    if (!source) throw new NotFoundException('Template not found');

    const code = this.normalizeCode(dto.code);
    if (!code) throw new BadRequestException('Template code is required');
    await this.assertCodeAvailable(dto.targetSchoolId, code);

    return this.prisma.template.create({
      data: {
        name: dto.name.trim(),
        code,
        description: source.description,
        schoolId: dto.targetSchoolId,
        frontBgUrl: source.frontBgUrl,
        backBgUrl: source.backBgUrl,
        frontConfig: source.frontConfig as object,
        backConfig: source.backConfig as object | undefined,
        orientation: source.orientation,
        isDefault: false,
      },
      include: {
        _count: { select: { idCards: true } },
        school: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async update(id: string, dto: UpdateTemplateDto) {
    const existing = await this.findOne(id);
    const data: Record<string, unknown> = { ...dto };
    if (dto.name) data.name = dto.name.trim();
    if (dto.code !== undefined) {
      const code = this.normalizeCode(dto.code);
      if (code && existing.schoolId) {
        await this.assertCodeAvailable(existing.schoolId, code, id);
      }
      data.code = code ?? null;
    }
    if (dto.frontConfig !== undefined) {
      data.frontConfig = this.normalizeFrontConfig(dto.frontConfig) as object;
    }
    if (dto.backConfig !== undefined) {
      data.backConfig = this.normalizeFrontConfig(dto.backConfig) as object;
    }
    return this.prisma.template.update({
      where: { id },
      data,
      include: { _count: { select: { idCards: true } }, school: { select: { id: true, name: true, code: true } } },
    });
  }

  async remove(id: string) {
    return this.prisma.template.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
