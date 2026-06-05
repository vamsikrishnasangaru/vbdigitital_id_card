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

  async getSuperAdminDashboard() {
    const [totalSchools, totalStudents, totalOrders, pendingOrders, printingBatches, deliveries] = await Promise.all([
      this.prisma.school.count({ where: { deletedAt: null } }),
      this.prisma.student.count({ where: { deletedAt: null } }),
      this.prisma.order.count({ where: { deletedAt: null } }),
      this.prisma.order.count({ where: { status: 'SUBMITTED', deletedAt: null } }),
      this.prisma.printBatch.count({ where: { status: 'QUEUED' } }),
      this.prisma.delivery.count({ where: { status: { in: ['PACKED', 'DISPATCHED', 'IN_TRANSIT'] } } }),
    ]);

    // Monthly trend (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyStudents = await this.prisma.student.groupBy({
      by: ['createdAt'],
      where: { createdAt: { gte: sixMonthsAgo }, deletedAt: null },
      _count: true,
    });

    return {
      totalSchools, totalStudents, totalOrders, pendingOrders,
      printingBatches, activeDeliveries: deliveries,
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
    const [totalStudents, draftStudents, submittedStudents, approvedStudents, totalOrders, pendingDeliveries] = await Promise.all([
      this.prisma.student.count({ where: { schoolId, deletedAt: null } }),
      this.prisma.student.count({ where: { schoolId, status: 'DRAFT', deletedAt: null } }),
      this.prisma.student.count({ where: { schoolId, status: 'SUBMITTED', deletedAt: null } }),
      this.prisma.student.count({ where: { schoolId, status: 'APPROVED', deletedAt: null } }),
      this.prisma.order.count({ where: { schoolId, deletedAt: null } }),
      this.prisma.delivery.count({ where: { schoolId, status: { not: 'DELIVERED' } } }),
    ]);

    const classWise = await this.prisma.class.findMany({
      where: { schoolId, deletedAt: null },
      include: { 
        _count: { select: { students: true } }, 
        sections: { 
          include: { _count: { select: { students: true } } } 
        } 
      },
      orderBy: { sortOrder: 'asc' },
    });

    return {
      totalStudents, draftStudents, submittedStudents, approvedStudents,
      totalOrders, pendingDeliveries, classWise,
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

    const sectionIds = assignments.map(a => a.sectionId);

    const [totalStudents, draftStudents, submittedStudents, approvedStudents] = await Promise.all([
      this.prisma.student.count({ where: { sectionId: { in: sectionIds }, deletedAt: null } }),
      this.prisma.student.count({ where: { sectionId: { in: sectionIds }, status: 'DRAFT', deletedAt: null } }),
      this.prisma.student.count({ where: { sectionId: { in: sectionIds }, status: 'SUBMITTED', deletedAt: null } }),
      this.prisma.student.count({ where: { sectionId: { in: sectionIds }, status: 'APPROVED', deletedAt: null } }),
    ]);

    // Get stats per section
    const sectionStats = await Promise.all(assignments.map(async (a) => {
      const count = await this.prisma.student.count({ where: { sectionId: a.sectionId, deletedAt: null } });
      const approved = await this.prisma.student.count({ where: { sectionId: a.sectionId, status: 'APPROVED', deletedAt: null } });
      return {
        className: a.class.name,
        sectionName: a.section.name,
        total: count,
        approved,
        percentage: count > 0 ? Math.round((approved / count) * 100) : 0,
      };
    }));

    return {
      totalStudents, draftStudents, submittedStudents, approvedStudents,
      assignments: sectionStats,
      recentStudents: sectionIds.length
        ? await this.getRecentStudents({ sectionId: { in: sectionIds } })
        : [],
    };
  }
}
