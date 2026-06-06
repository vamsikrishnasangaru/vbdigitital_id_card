import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  completeStudentWhere,
  incompleteStudentWhere,
} from '../students/student-completion.util';

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
  ): Prisma.StudentWhereInput | null {
    if (assignments.length === 0) return null;
    return {
      deletedAt: null,
      OR: assignments.map((a) => ({
        classId: a.classId,
        sectionId: a.sectionId,
      })),
    };
  }

  private async studentMetrics(base: Prisma.StudentWhereInput = {}) {
    const active = { ...base, deletedAt: null };
    const [totalStudents, incompleteStudents, completeStudents, submittedStudents] =
      await Promise.all([
        this.prisma.student.count({ where: active }),
        this.prisma.student.count({ where: incompleteStudentWhere(base) }),
        this.prisma.student.count({ where: completeStudentWhere(base) }),
        this.prisma.student.count({
          where: { ...active, status: 'SUBMITTED' },
        }),
      ]);

    return { totalStudents, incompleteStudents, completeStudents, submittedStudents };
  }

  async getSuperAdminDashboard() {
    const [
      totalSchools,
      totalTemplates,
      totalIdCards,
      totalTeachers,
      studentCounts,
    ] = await Promise.all([
      this.prisma.school.count({ where: { deletedAt: null } }),
      this.prisma.template.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.idCard.count({ where: { deletedAt: null } }),
      this.prisma.user.count({
        where: { role: 'TEACHER', deletedAt: null, isActive: true },
      }),
      this.studentMetrics(),
    ]);

    return {
      totalSchools,
      ...studentCounts,
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
    const base = { schoolId };
    const [
      studentCounts,
      totalClasses,
      totalTeachers,
      totalTemplates,
      totalIdCards,
    ] = await Promise.all([
      this.studentMetrics(base),
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
      ...studentCounts,
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
    const scope = this.assignmentStudentWhere(pairs);

    const studentCounts = scope
      ? await this.studentMetrics(scope)
      : {
          totalStudents: 0,
          incompleteStudents: 0,
          completeStudents: 0,
          submittedStudents: 0,
        };

    const sectionStats = await Promise.all(
      assignments.map(async (a) => {
        const rowBase = {
          classId: a.classId,
          sectionId: a.sectionId,
        };
        const total = await this.prisma.student.count({
          where: { ...rowBase, deletedAt: null },
        });
        const complete = await this.prisma.student.count({
          where: completeStudentWhere(rowBase),
        });
        return {
          className: a.class.name,
          sectionName: a.section.name,
          total,
          complete,
          percentage: total > 0 ? Math.round((complete / total) * 100) : 0,
        };
      }),
    );

    return {
      ...studentCounts,
      assignments: sectionStats,
      recentStudents: scope
        ? await this.getRecentStudents(scope)
        : [],
    };
  }
}
