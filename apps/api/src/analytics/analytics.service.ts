import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  private getRecentStudents(where: Prisma.StudentWhereInput) {
    return this.prisma.student.findMany({
      where: { ...where, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        rollNumber: true,
        status: true,
        createdAt: true,
        class: { select: { name: true } },
        section: { select: { name: true } },
        school: { select: { id: true, name: true } },
      },
    });
  }

  private assignmentStudentWhere(
    assignments: { classId: string; sectionId: string }[],
  ): Prisma.StudentWhereInput {
    if (assignments.length === 0) {
      return { id: '__none__' };
    }
    return {
      deletedAt: null,
      OR: assignments.map((a) => ({
        classId: a.classId,
        sectionId: a.sectionId,
      })),
    };
  }

  async getSuperAdminDashboard() {
    const [
      totalSchools,
      totalStudents,
      totalTemplates,
      totalIdCards,
      totalTeachers,
    ] = await Promise.all([
      this.prisma.school.count({ where: { deletedAt: null } }),
      this.prisma.student.count({ where: { deletedAt: null } }),
      this.prisma.template.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.idCard.count({ where: { deletedAt: null } }),
      this.prisma.user.count({
        where: { role: 'TEACHER', deletedAt: null, isActive: true },
      }),
    ]);

    return {
      totalSchools,
      totalStudents,
      totalTemplates,
      totalIdCards,
      totalTeachers,
      recentSchools: await this.prisma.school.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { _count: { select: { students: { where: { deletedAt: null } } } } },
      }),
      recentStudents: await this.getRecentStudents({}),
    };
  }

  async getSchoolDashboard(schoolId: string) {
    const [
      totalStudents,
      draftStudents,
      submittedStudents,
      approvedStudents,
      totalClasses,
      totalTeachers,
      totalTemplates,
      totalIdCards,
    ] = await Promise.all([
      this.prisma.student.count({ where: { schoolId, deletedAt: null } }),
      this.prisma.student.count({ where: { schoolId, status: 'DRAFT', deletedAt: null } }),
      this.prisma.student.count({ where: { schoolId, status: 'SUBMITTED', deletedAt: null } }),
      this.prisma.student.count({ where: { schoolId, status: 'APPROVED', deletedAt: null } }),
      this.prisma.class.count({ where: { schoolId, deletedAt: null } }),
      this.prisma.user.count({
        where: { schoolId, role: 'TEACHER', deletedAt: null, isActive: true },
      }),
      this.prisma.template.count({
        where: {
          deletedAt: null,
          isActive: true,
          OR: [{ schoolId }, { schoolId: null }],
        },
      }),
      this.prisma.idCard.count({
        where: { deletedAt: null, student: { schoolId, deletedAt: null } },
      }),
    ]);

    const classWise = await this.prisma.class.findMany({
      where: { schoolId, deletedAt: null },
      select: {
        id: true,
        name: true,
        _count: { select: { students: { where: { deletedAt: null } } } },
      },
      orderBy: { sortOrder: 'asc' },
      take: 8,
    });

    return {
      totalStudents,
      draftStudents,
      submittedStudents,
      approvedStudents,
      totalClasses,
      totalTeachers,
      totalTemplates,
      totalIdCards,
      classWise,
      recentStudents: await this.getRecentStudents({ schoolId }),
    };
  }

  async getTeacherDashboard(userId: string) {
    const assignments = await this.prisma.teacherAssignment.findMany({
      where: { userId },
      include: {
        class: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
      },
    });

    const pairs = assignments.map((a) => ({
      classId: a.classId,
      sectionId: a.sectionId,
    }));
    const studentWhere = this.assignmentStudentWhere(pairs);

    const [totalStudents, draftStudents, submittedStudents, approvedStudents] =
      await Promise.all([
        pairs.length
          ? this.prisma.student.count({ where: studentWhere })
          : Promise.resolve(0),
        pairs.length
          ? this.prisma.student.count({ where: { ...studentWhere, status: 'DRAFT' } })
          : Promise.resolve(0),
        pairs.length
          ? this.prisma.student.count({ where: { ...studentWhere, status: 'SUBMITTED' } })
          : Promise.resolve(0),
        pairs.length
          ? this.prisma.student.count({ where: { ...studentWhere, status: 'APPROVED' } })
          : Promise.resolve(0),
      ]);

    const sectionStats = await Promise.all(
      assignments.map(async (a) => {
        const base = {
          classId: a.classId,
          sectionId: a.sectionId,
          deletedAt: null,
        };
        const count = await this.prisma.student.count({ where: base });
        const approved = await this.prisma.student.count({
          where: { ...base, status: 'APPROVED' },
        });
        return {
          className: a.class.name,
          sectionName: a.section.name,
          total: count,
          approved,
          percentage: count > 0 ? Math.round((approved / count) * 100) : 0,
        };
      }),
    );

    return {
      totalStudents,
      draftStudents,
      submittedStudents,
      approvedStudents,
      assignments: sectionStats,
      recentStudents: pairs.length
        ? await this.getRecentStudents({
            OR: pairs.map((p) => ({
              classId: p.classId,
              sectionId: p.sectionId,
            })),
          })
        : [],
    };
  }
}
