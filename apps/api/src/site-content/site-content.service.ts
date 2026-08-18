import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_SITE_CONTENT, type SiteContentPayload, type SiteMedia } from './site-content.defaults';
import { UpdateSiteContentDto } from './dto/update-site-content.dto';

const ROW_ID = 'default';

@Injectable()
export class SiteContentService {
  constructor(private prisma: PrismaService) {}

  async getPublic(): Promise<SiteContentPayload> {
    try {
      const row = await this.prisma.siteContent.findUnique({ where: { id: ROW_ID } });
      if (!row) return DEFAULT_SITE_CONTENT;
      return this.toPayload(row);
    } catch (err) {
      console.warn('[SiteContent] falling back to defaults:', err);
      return DEFAULT_SITE_CONTENT;
    }
  }

  async upsert(dto: UpdateSiteContentDto): Promise<SiteContentPayload> {
    const current = await this.getPublic();
    const next: SiteContentPayload = {
      ...current,
      ...this.pickDefined(dto),
      id: ROW_ID,
    };

    const json = {
      stats: next.stats as Prisma.InputJsonValue,
      howItWorks: next.howItWorks as Prisma.InputJsonValue,
      generationSteps: next.generationSteps as Prisma.InputJsonValue,
      media: next.media as Prisma.InputJsonValue,
    };

    try {
      const saved = await this.prisma.siteContent.upsert({
        where: { id: ROW_ID },
        create: {
          id: ROW_ID,
          heroTitle: next.heroTitle,
          heroSubtitle: next.heroSubtitle,
          ...json,
          ctaLabel: next.ctaLabel,
          moreInfoTitle: next.moreInfoTitle,
          moreInfoIntro: next.moreInfoIntro,
        },
        update: {
          heroTitle: next.heroTitle,
          heroSubtitle: next.heroSubtitle,
          ...json,
          ctaLabel: next.ctaLabel,
          moreInfoTitle: next.moreInfoTitle,
          moreInfoIntro: next.moreInfoIntro,
        },
      });
      return this.toPayload(saved);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'P2021' || code === 'P2022') {
        throw new InternalServerErrorException(
          'Landing page table is missing. Run: pnpm --filter @repo/db exec prisma migrate deploy',
        );
      }
      throw err;
    }
  }

  async addMedia(item: SiteMedia): Promise<SiteContentPayload> {
    const current = await this.getPublic();
    return this.upsert({ media: [...current.media, item] });
  }

  async removeMedia(id: string): Promise<SiteContentPayload> {
    const current = await this.getPublic();
    return this.upsert({ media: current.media.filter((m) => m.id !== id) });
  }

  private pickDefined(dto: UpdateSiteContentDto): Partial<SiteContentPayload> {
    const out: Partial<SiteContentPayload> = {};
    if (dto.heroTitle !== undefined) out.heroTitle = dto.heroTitle.trim();
    if (dto.heroSubtitle !== undefined) out.heroSubtitle = dto.heroSubtitle.trim();
    if (dto.stats !== undefined) out.stats = dto.stats;
    if (dto.howItWorks !== undefined) out.howItWorks = dto.howItWorks;
    if (dto.generationSteps !== undefined) out.generationSteps = dto.generationSteps;
    if (dto.media !== undefined) out.media = dto.media;
    if (dto.ctaLabel !== undefined) out.ctaLabel = dto.ctaLabel.trim() || DEFAULT_SITE_CONTENT.ctaLabel;
    if (dto.moreInfoTitle !== undefined) out.moreInfoTitle = dto.moreInfoTitle.trim();
    if (dto.moreInfoIntro !== undefined) out.moreInfoIntro = dto.moreInfoIntro.trim();
    return out;
  }

  private toPayload(row: {
    id: string;
    heroTitle: string;
    heroSubtitle: string;
    stats: unknown;
    howItWorks: unknown;
    generationSteps: unknown;
    media: unknown;
    ctaLabel: string;
    moreInfoTitle: string;
    moreInfoIntro: string;
    updatedAt: Date;
  }): SiteContentPayload {
    return {
      id: row.id,
      heroTitle: row.heroTitle || DEFAULT_SITE_CONTENT.heroTitle,
      heroSubtitle: row.heroSubtitle || DEFAULT_SITE_CONTENT.heroSubtitle,
      stats: asArray(row.stats, DEFAULT_SITE_CONTENT.stats),
      howItWorks: asArray(row.howItWorks, DEFAULT_SITE_CONTENT.howItWorks),
      generationSteps: asArray(row.generationSteps, DEFAULT_SITE_CONTENT.generationSteps),
      media: asArray(row.media, DEFAULT_SITE_CONTENT.media),
      ctaLabel: row.ctaLabel || DEFAULT_SITE_CONTENT.ctaLabel,
      moreInfoTitle: row.moreInfoTitle || DEFAULT_SITE_CONTENT.moreInfoTitle,
      moreInfoIntro: row.moreInfoIntro || DEFAULT_SITE_CONTENT.moreInfoIntro,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function asArray<T>(value: unknown, fallback: T[]): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback;
}
