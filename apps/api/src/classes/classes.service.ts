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

  assertSchoolAccess(role: string, userSchoolId: string | undefined, targetSchoolId: string) {
    if (role !== 'SUPER_ADMIN' && userSchoolId !== targetSchoolId) {
      throw new ForbiddenException('You can only manage classes for your own school');
    }
  }

  async createClass(schoolId: string, name: string, sortOrder?: number) {
    const trimmed = name?.trim();
    if (!trimmed) throw new BadRequestException('Class name is required');

    const maxOrder = await this.prisma.class.aggregate({
      where: { schoolId, deletedAt: null },
      _max: { sortOrder: true },
    });
    const nextOrder = sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1;

    try {
      return await this.prisma.class.create({
        data: { schoolId, name: trimmed, sortOrder: nextOrder },
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
            by: ['sectionId'],
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

    const sectionCountMap = new Map(
      bySection.map((row) => [row.sectionId, row._count._all]),
    );
    const classCountMap = new Map(byClass.map((row) => [row.classId, row._count._all]));

    return classes.map((cls) => ({
      ...cls,
      _count: { students: classCountMap.get(cls.id) ?? cls._count.students },
      sections: cls.sections.map((sec) => ({
        ...sec,
        _count: {
          students: sectionCountMap.get(sec.id) ?? sec._count.students,
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
      include: { _count: { select: { students: { where: { deletedAt: null } } } } },
    });
    if (!section) throw new NotFoundException('Section not found');
    if (section._count.students > 0) {
      throw new BadRequestException(
        `Cannot delete section with ${section._count.students} enrolled student(s). Reassign students first.`,
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
}
