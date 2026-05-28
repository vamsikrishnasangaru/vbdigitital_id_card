import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeacherDto, UpdateTeacherDto } from './dto/teacher.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class TeachersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateTeacherDto, currentUserSchoolId?: string) {
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) throw new ConflictException('User with this email already exists');

    const schoolId = currentUserSchoolId || dto.schoolId;
    if (!schoolId) throw new ConflictException('School ID is required to create a teacher');

    const passwordHash = await bcrypt.hash(dto.password || 'Teacher@123', 12);

    // Use a transaction so the user + assignment are created atomically
    return this.prisma.$transaction(async (tx) => {
      const teacher = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          role: 'TEACHER',
          schoolId,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          isActive: true,
          schoolId: true,
          createdAt: true,
        }
      });

      // If class and section were provided, create the assignment
      if (dto.classId && dto.sectionId) {
        await tx.teacherAssignment.create({
          data: {
            userId: teacher.id,
            classId: dto.classId,
            sectionId: dto.sectionId,
          },
        });
      }

      return teacher;
    });
  }

  async getMyAssignments(userId: string) {
    return this.prisma.teacherAssignment.findMany({
      where: { user: { id: userId, role: 'TEACHER', deletedAt: null } },
      include: {
        class: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
      },
      orderBy: [{ class: { sortOrder: 'asc' } }, { section: { sortOrder: 'asc' } }],
    });
  }

  async findAll(
    schoolId?: string,
    query?: { search?: string; limit?: number; page?: number; isActive?: boolean },
  ) {
    const where: any = { role: 'TEACHER', deletedAt: null };
    if (schoolId) where.schoolId = schoolId;

    if (query?.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query?.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const limit = query?.limit || 20;
    const page = query?.page || 1;

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          isActive: true,
          schoolId: true,
          school: { select: { name: true } },
          teacherAssignments: {
            select: {
              id: true,
              class: { select: { id: true, name: true } },
              section: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async update(id: string, dto: UpdateTeacherDto, schoolId?: string) {
    const where: any = { id, role: 'TEACHER', deletedAt: null };
    if (schoolId) where.schoolId = schoolId;

    const teacher = await this.prisma.user.findFirst({ where });
    if (!teacher) throw new NotFoundException('Teacher not found');

    const { classId, sectionId, password, ...rest } = dto as any;
    const updateData: any = { ...rest };
    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 12);
    }
    // Remove fields that don't belong on the User model
    delete updateData.classId;
    delete updateData.sectionId;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          isActive: true,
        },
      });

      if (classId === '' && sectionId === '') {
        await tx.teacherAssignment.deleteMany({ where: { userId: id } });
      } else if (classId && sectionId) {
        await tx.teacherAssignment.deleteMany({ where: { userId: id } });
        await tx.teacherAssignment.create({
          data: { userId: id, classId, sectionId },
        });
      }

      return updated;
    });
  }

  async remove(id: string, schoolId?: string) {
    const where: any = { id, role: 'TEACHER', deletedAt: null };
    if (schoolId) where.schoolId = schoolId;

    const teacher = await this.prisma.user.findFirst({ where });
    if (!teacher) throw new NotFoundException('Teacher not found');

    return this.prisma.$transaction(async (tx) => {
      // Remove assignments first
      await tx.teacherAssignment.deleteMany({ where: { userId: id } });
      // Soft delete the teacher
      return tx.user.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });
    });
  }
}
