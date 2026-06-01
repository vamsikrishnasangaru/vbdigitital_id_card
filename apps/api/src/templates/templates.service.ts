import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto';
import { Orientation } from '@prisma/client';

@Injectable()
export class TemplatesService {
  constructor(private prisma: PrismaService) {}

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
    return tpl;
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
