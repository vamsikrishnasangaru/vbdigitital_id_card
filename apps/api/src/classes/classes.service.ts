import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClassesService {
  constructor(private prisma: PrismaService) {}

  private readonly classInclude = {
    sections: {
      where: { deletedAt: null },
      orderBy: { sortOrder: 'asc' as const },
      include: {
        _count: { select: { students: { where: { deletedAt: null } } } },
      },
    },
    _count: { select: { students: { where: { deletedAt: null } } } },
  };

  assertSchoolAccess(role: string, userSchoolId: string | undefined, targetSchoolId: string) {
    if (role !== 'SUPER_ADMIN' && userSchoolId !== targetSchoolId) {
      throw new ForbiddenException('You can only manage classes for your own school');
    }
  }

  async createClass(schoolId: string, name: string, sortOrder?: number) {
    const trimmed = name?.trim();
    if (!trimmed) throw new BadRequestException('Class name is required');

    const active = await this.prisma.class.findFirst({
      where: { schoolId, name: trimmed, deletedAt: null },
      select: { id: true },
    });
    if (active) {
      throw new ConflictException(`Class "${trimmed}" already exists in this school`);
    }

    const maxOrder = await this.prisma.class.aggregate({
      where: { schoolId, deletedAt: null },
      _max: { sortOrder: true },
    });
    const nextOrder = sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1;

    const deleted = await this.prisma.class.findFirst({
      where: { schoolId, name: trimmed, deletedAt: { not: null } },
      select: { id: true },
    });
    if (deleted) {
      const studentCount = await this.prisma.student.count({
        where: { classId: deleted.id, deletedAt: null },
      });
      if (studentCount > 0) {
        throw new ConflictException(
          `A previously deleted class named "${trimmed}" still has ${studentCount} student(s). Use a different name or restore students first.`,
        );
      }

      return this.prisma.$transaction(async (tx) => {
        await tx.section.updateMany({
          where: { classId: deleted.id, deletedAt: { not: null } },
          data: { deletedAt: null },
        });
        return tx.class.update({
          where: { id: deleted.id },
          data: { deletedAt: null, sortOrder: nextOrder },
          include: this.classInclude,
        });
      });
    }

    try {
      return await this.prisma.class.create({
        data: { schoolId, name: trimmed, sortOrder: nextOrder },
        include: this.classInclude,
      });
    } catch {
      throw new ConflictException('A class with this name already exists in this school');
    }
  }

  async findAllClasses(schoolId: string) {
    const classes = await this.prisma.class.findMany({
      where: { schoolId, deletedAt: null },
      include: {
        sections: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          include: {
            _count: { select: { students: { where: { deletedAt: null } } } },
          },
        },
        _count: { select: { students: { where: { deletedAt: null } } } },
      },
      orderBy: { sortOrder: 'asc' },
    });

    if (classes.length === 0) return classes;

    const sectionIds = classes.flatMap((c) => c.sections.map((s) => s.id));
    const classIds = classes.map((c) => c.id);

    const [bySection, byClass] = await Promise.all([
      sectionIds.length
        ? this.prisma.student.groupBy({
            by: ['sectionId', 'classId'],
            where: { schoolId, deletedAt: null, sectionId: { in: sectionIds } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      this.prisma.student.groupBy({
        by: ['classId'],
        where: { schoolId, deletedAt: null, classId: { in: classIds } },
        _count: { _all: true },
      }),
    ]);

    const sectionCountMap = new Map<string, number>(
      bySection.map(
        (row) => [`${row.classId}:${row.sectionId}`, row._count._all] as [string, number],
      ),
    );
    const classCountMap = new Map<string, number>(
      byClass.map((row) => [row.classId, row._count._all] as [string, number]),
    );

    return classes.map((cls) => ({
      ...cls,
      _count: { students: classCountMap.get(cls.id) ?? cls._count.students },
      sections: cls.sections.map((sec) => ({
        ...sec,
        _count: {
          students: sectionCountMap.get(`${cls.id}:${sec.id}`) ?? 0,
        },
      })),
    }));
  }

  /** Lightweight list for dropdowns (enrollment, filters) — no per-section student counts. */
  async findAllClassesPicker(schoolId: string) {
    return this.prisma.class.findMany({
      where: { schoolId, deletedAt: null },
      select: {
        id: true,
        name: true,
        sortOrder: true,
        sections: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, name: true, sortOrder: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async deleteClass(id: string, schoolId?: string) {
    const cls = await this.prisma.class.findFirst({
      where: { id, deletedAt: null, ...(schoolId ? { schoolId } : {}) },
      include: { _count: { select: { students: { where: { deletedAt: null } } } } },
    });
    if (!cls) throw new NotFoundException('Class not found');
    if (cls._count.students > 0) {
      throw new BadRequestException(
        `Cannot delete class with ${cls._count.students} enrolled student(s). Move or remove students first.`,
      );
    }

    const now = new Date();
    return this.prisma.$transaction([
      this.prisma.section.updateMany({
        where: { classId: id, deletedAt: null },
        data: { deletedAt: now },
      }),
      this.prisma.class.update({ where: { id }, data: { deletedAt: now } }),
    ]);
  }

  async createSection(classId: string, name: string, schoolId?: string) {
    const trimmed = name?.trim();
    if (!trimmed) throw new BadRequestException('Section name is required');

    const cls = await this.prisma.class.findFirst({
      where: { id: classId, deletedAt: null, ...(schoolId ? { schoolId } : {}) },
    });
    if (!cls) throw new NotFoundException('Class not found');

    const maxOrder = await this.prisma.section.aggregate({
      where: { classId, deletedAt: null },
      _max: { sortOrder: true },
    });
    const nextOrder = (maxOrder._max.sortOrder ?? 0) + 1;

    const active = await this.prisma.section.findFirst({
      where: { classId, name: trimmed, deletedAt: null },
      select: { id: true },
    });
    if (active) {
      throw new ConflictException(`Section "${trimmed}" already exists in this class`);
    }

    const deleted = await this.prisma.section.findFirst({
      where: { classId, name: trimmed, deletedAt: { not: null } },
      select: { id: true, classId: true },
    });
    if (deleted) {
      const studentCount = await this.prisma.student.count({
        where: { sectionId: deleted.id, classId: deleted.classId, deletedAt: null },
      });
      if (studentCount > 0) {
        throw new ConflictException(
          `A previously deleted section named "${trimmed}" still has ${studentCount} student(s). Reassign them first.`,
        );
      }

      return this.prisma.section.update({
        where: { id: deleted.id },
        data: { deletedAt: null, sortOrder: nextOrder },
        include: {
          _count: { select: { students: { where: { deletedAt: null } } } },
        },
      });
    }

    try {
      return await this.prisma.section.create({
        data: { classId, name: trimmed, sortOrder: nextOrder },
        include: {
          _count: { select: { students: { where: { deletedAt: null } } } },
        },
      });
    } catch {
      throw new ConflictException('A section with this name already exists in this class');
    }
  }

  async deleteSection(id: string, schoolId?: string) {
    const section = await this.prisma.section.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(schoolId ? { class: { schoolId } } : {}),
      },
      select: { id: true, name: true, classId: true },
    });
    if (!section) throw new NotFoundException('Section not found');

    const studentCount = await this.prisma.student.count({
      where: { sectionId: id, classId: section.classId, deletedAt: null },
    });
    if (studentCount > 0) {
      throw new BadRequestException(
        `Cannot delete section with ${studentCount} enrolled student(s). Reassign students first.`,
      );
    }

    await this.prisma.teacherAssignment.deleteMany({ where: { sectionId: id } });
    return this.prisma.section.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async assignTeacher(userId: string, classId: string, sectionId: string, schoolId?: string) {
    const cls = await this.prisma.class.findFirst({
      where: { id: classId, deletedAt: null, ...(schoolId ? { schoolId } : {}) },
    });
    if (!cls) throw new NotFoundException('Class not found');

    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, classId, deletedAt: null },
    });
    if (!section) throw new NotFoundException('Section not found in this class');

    const teacher = await this.prisma.user.findFirst({
      where: { id: userId, role: 'TEACHER', schoolId: cls.schoolId, deletedAt: null, isActive: true },
    });
    if (!teacher) {
      throw new BadRequestException('Teacher not found or not active in this school');
    }

    const existing = await this.prisma.teacherAssignment.findFirst({
      where: { userId, classId, sectionId },
    });
    if (existing) {
      throw new ConflictException('This teacher is already assigned to this class and section');
    }

    return this.prisma.teacherAssignment.create({
      data: { userId, classId, sectionId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        class: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
      },
    });
  }

  async getTeacherAssignments(schoolId: string) {
    return this.prisma.teacherAssignment.findMany({
      where: { class: { schoolId, deletedAt: null }, section: { deletedAt: null } },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        class: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
      },
      orderBy: [{ class: { sortOrder: 'asc' } }, { section: { sortOrder: 'asc' } }],
    });
  }

  async removeTeacherAssignment(id: string, schoolId?: string) {
    const assignment = await this.prisma.teacherAssignment.findFirst({
      where: {
        id,
        ...(schoolId ? { class: { schoolId } } : {}),
      },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    return this.prisma.teacherAssignment.delete({ where: { id } });
  }

  /** Match Excel class/section names (e.g. "10" ↔ "Class 10", "A" ↔ "Section A"). */
  private normKey(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private normClassName(value: string): string {
    return this.normKey(value)
      .replace(/[._-]/g, ' ')
      .replace(/\b(class|grade|standard|std)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normSectionName(value: string): string {
    return this.normKey(value)
      .replace(/[._-]/g, ' ')
      .replace(/\b(section|sec)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private registerClassInCache(
    cache: Map<string, { id: string; name: string; sections: Map<string, { id: string; name: string }> }>,
    cls: { id: string; name: string },
  ) {
    const entry = {
      id: cls.id,
      name: cls.name,
      sections: new Map<string, { id: string; name: string }>(),
    };
    cache.set(this.normKey(cls.name), entry);
    cache.set(this.normClassName(cls.name), entry);
    return entry;
  }

  private registerSectionInCache(
    entry: { sections: Map<string, { id: string; name: string }> },
    sec: { id: string; name: string },
  ) {
    entry.sections.set(this.normKey(sec.name), sec);
    entry.sections.set(this.normSectionName(sec.name), sec);
  }

  async buildClassSectionCache(schoolId: string) {
    const classes = await this.prisma.class.findMany({
      where: { schoolId, deletedAt: null },
      include: { sections: { where: { deletedAt: null } } },
    });

    const cache = new Map<
      string,
      { id: string; name: string; sections: Map<string, { id: string; name: string }> }
    >();

    for (const cls of classes) {
      const entry = this.registerClassInCache(cache, cls);
      for (const sec of cls.sections) {
        this.registerSectionInCache(entry, sec);
      }
    }

    return cache;
  }

  async findOrCreateClassSection(
    schoolId: string,
    className: string,
    sectionName: string,
    cache: Map<
      string,
      { id: string; name: string; sections: Map<string, { id: string; name: string }> }
    >,
  ): Promise<{ classId: string; sectionId: string; createdClass: boolean; createdSection: boolean }> {
    const trimmedClass = className?.trim();
    const trimmedSection = sectionName?.trim();
    if (!trimmedClass) throw new BadRequestException('Class name is required');
    if (!trimmedSection) throw new BadRequestException('Section name is required');

    let createdClass = false;
    let createdSection = false;

    let entry =
      cache.get(this.normClassName(trimmedClass)) ?? cache.get(this.normKey(trimmedClass));

    if (!entry) {
      try {
        const created = await this.createClass(schoolId, trimmedClass);
        entry = this.registerClassInCache(cache, created);
        createdClass = true;
      } catch (err) {
        if (!(err instanceof ConflictException)) throw err;
        const refreshed = await this.buildClassSectionCache(schoolId);
        for (const [key, value] of refreshed) cache.set(key, value);
        entry =
          cache.get(this.normClassName(trimmedClass)) ?? cache.get(this.normKey(trimmedClass));
        if (!entry) throw err;
      }
    }

    let section =
      entry.sections.get(this.normSectionName(trimmedSection)) ??
      entry.sections.get(this.normKey(trimmedSection));

    if (!section) {
      try {
        const created = await this.createSection(entry.id, trimmedSection, schoolId);
        section = { id: created.id, name: created.name };
        this.registerSectionInCache(entry, section);
        createdSection = true;
      } catch (err) {
        if (!(err instanceof ConflictException)) throw err;
        const cls = await this.prisma.class.findFirst({
          where: { id: entry.id, deletedAt: null },
          include: { sections: { where: { deletedAt: null } } },
        });
        if (!cls) throw err;
        entry.sections.clear();
        for (const sec of cls.sections) {
          this.registerSectionInCache(entry, sec);
        }
        section =
          entry.sections.get(this.normSectionName(trimmedSection)) ??
          entry.sections.get(this.normKey(trimmedSection));
        if (!section) throw err;
      }
    }

    return { classId: entry.id, sectionId: section.id, createdClass, createdSection };
  }
}
