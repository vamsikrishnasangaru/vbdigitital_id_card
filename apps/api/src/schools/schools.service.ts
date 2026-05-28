import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSchoolDto, UpdateSchoolDto } from './dto/school.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class SchoolsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateSchoolDto) {
    const existing = await this.prisma.school.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException('School code already exists');

    const { adminPassword, ...schoolData } = dto;

    if (adminPassword && schoolData.email) {
      const existingUser = await this.prisma.user.findUnique({ where: { email: schoolData.email } });
      if (existingUser) throw new ConflictException('A user with the school email already exists');

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
    if (!school) throw new NotFoundException('School not found');
    return school;
  }

  async update(id: string, dto: UpdateSchoolDto) {
    await this.findOne(id);
    return this.prisma.school.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.school.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
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
