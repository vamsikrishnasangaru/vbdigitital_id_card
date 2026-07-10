import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSchoolDto, UpdateSchoolDto } from './dto/school.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class SchoolsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateSchoolDto) {
    const existing = await this.prisma.school.findFirst({
      where: { code: dto.code, deletedAt: null },
    });
    if (existing) throw new ConflictException('School code already exists');

    // Free unique school code held by a previously soft-deleted school.
    const softDeleted = await this.prisma.school.findFirst({
      where: { code: dto.code, deletedAt: { not: null } },
    });
    if (softDeleted) {
      await this.hardDeleteSchool(softDeleted.id);
    }

    const { adminPassword, ...schoolData } = dto;

    if (adminPassword && schoolData.email) {
      const existingUser = await this.prisma.user.findFirst({
        where: { email: schoolData.email, deletedAt: null },
      });
      if (existingUser) throw new ConflictException('A user with the school email already exists');

      const softDeletedUser = await this.prisma.user.findFirst({
        where: { email: schoolData.email, deletedAt: { not: null } },
      });
      if (softDeletedUser) {
        await this.prisma.session.deleteMany({ where: { userId: softDeletedUser.id } });
        await this.prisma.user.delete({ where: { id: softDeletedUser.id } });
      }

      const passwordHash = await bcrypt.hash(adminPassword, 12);

      return this.prisma.$transaction(async (tx) => {
        const school = await tx.school.create({ data: schoolData });
        await tx.user.create({
          data: {
            email: schoolData.email as string,
            passwordHash,
            firstName: schoolData.name,
            lastName: 'Admin',
            role: 'SCHOOL_ADMIN',
            schoolId: school.id,
          },
        });
        return school;
      });
    }

    return this.prisma.school.create({ data: schoolData });
  }

  async findAll(query: { search?: string; status?: string; page?: number; limit?: number }) {
    const { search, status, page = 1, limit = 20 } = query;
    const where: any = { deletedAt: null };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { state: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status === 'active') where.isActive = true;
    if (status === 'inactive') where.isActive = false;

    const [data, total] = await Promise.all([
      this.prisma.school.findMany({
        where,
        include: {
          _count: { select: { students: true, users: true, classes: true, orders: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.school.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const school = await this.prisma.school.findUnique({
      where: { id },
      include: {
        _count: { select: { students: true, users: true, classes: true, orders: true } },
        classes: {
          where: { deletedAt: null },
          include: { sections: { where: { deletedAt: null } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!school || school.deletedAt) throw new NotFoundException('School not found');
    return school;
  }

  async update(id: string, dto: UpdateSchoolDto) {
    await this.findOne(id);
    const { adminPassword, ...schoolData } = dto;

    if (!adminPassword?.trim()) {
      return this.prisma.school.update({ where: { id }, data: schoolData });
    }

    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const adminUser = await this.prisma.user.findFirst({
      where: { schoolId: id, role: 'SCHOOL_ADMIN', deletedAt: null },
    });
    if (!adminUser) {
      throw new NotFoundException('School admin account not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const school = await tx.school.update({ where: { id }, data: schoolData });
      await tx.user.update({
        where: { id: adminUser.id },
        data: { passwordHash },
      });
      return school;
    });
  }

  /** Permanently remove school and related records so code/email can be reused. */
  private async hardDeleteSchool(id: string) {
    await this.prisma.$transaction(async (tx) => {
      const students = await tx.student.findMany({ where: { schoolId: id }, select: { id: true } });
      const studentIds = students.map((s) => s.id);
      if (studentIds.length) {
        await tx.idCard.deleteMany({ where: { studentId: { in: studentIds } } });
        await tx.student.deleteMany({ where: { schoolId: id } });
      }

      const classes = await tx.class.findMany({ where: { schoolId: id }, select: { id: true } });
      const classIds = classes.map((c) => c.id);
      if (classIds.length) {
        await tx.teacherAssignment.deleteMany({ where: { classId: { in: classIds } } });
        await tx.section.deleteMany({ where: { classId: { in: classIds } } });
        await tx.class.deleteMany({ where: { schoolId: id } });
      }

      const orders = await tx.order.findMany({ where: { schoolId: id }, select: { id: true } });
      const orderIds = orders.map((o) => o.id);
      if (orderIds.length) {
        await tx.idCard.updateMany({ where: { orderId: { in: orderIds } }, data: { orderId: null } });
        await tx.delivery.deleteMany({ where: { orderId: { in: orderIds } } });
        await tx.printBatch.deleteMany({ where: { orderId: { in: orderIds } } });
        await tx.order.deleteMany({ where: { schoolId: id } });
      }

      await tx.delivery.deleteMany({ where: { schoolId: id } });
      await tx.printBatch.deleteMany({ where: { schoolId: id } });
      await tx.driveFile.deleteMany({ where: { schoolId: id } });
      await tx.notification.deleteMany({ where: { schoolId: id } });
      await tx.auditLog.deleteMany({ where: { schoolId: id } });
      await tx.template.deleteMany({ where: { schoolId: id } });

      const users = await tx.user.findMany({ where: { schoolId: id }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      if (userIds.length) {
        await tx.session.deleteMany({ where: { userId: { in: userIds } } });
        await tx.teacherAssignment.deleteMany({ where: { userId: { in: userIds } } });
        await tx.notification.deleteMany({ where: { userId: { in: userIds } } });
        await tx.auditLog.updateMany({ where: { userId: { in: userIds } }, data: { userId: null } });
        await tx.user.deleteMany({ where: { schoolId: id } });
      }

      await tx.school.delete({ where: { id } });
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.hardDeleteSchool(id);
    return { id, deleted: true };
  }

  async getStats(id: string) {
    const [students, approvedStudents, pendingStudents, classes, orders] = await Promise.all([
      this.prisma.student.count({ where: { schoolId: id, deletedAt: null } }),
      this.prisma.student.count({ where: { schoolId: id, status: 'APPROVED', deletedAt: null } }),
      this.prisma.student.count({ where: { schoolId: id, status: 'SUBMITTED', deletedAt: null } }),
      this.prisma.class.count({ where: { schoolId: id, deletedAt: null } }),
      this.prisma.order.count({ where: { schoolId: id, deletedAt: null } }),
    ]);
    return { students, approvedStudents, pendingStudents, classes, orders };
  }
}
