import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';

@Injectable()
export class StudentsService {
  constructor(
    private prisma: PrismaService,
    private uploadsService: UploadsService,
  ) {}

  async create(data: any, file?: Express.Multer.File) {
    const requiredFields = [
      'schoolId',
      'classId',
      'sectionId',
      'firstName',
      'lastName',
      'rollNumber',
      'parentName',
      'parentPhone',
      'address',
    ] as const;
    for (const field of requiredFields) {
      const value = typeof data[field] === 'string' ? data[field].trim() : data[field];
      if (!value) {
        throw new BadRequestException(`${field} is required`);
      }
    }

    let photoUrl = data.photoUrl;

    if (file) {
      photoUrl = await this.uploadsService.saveFile(file, `schools/${data.schoolId}/students`);
    }

    const { photo, ...rest } = data;
    const rollNumber = String(rest.rollNumber).trim();
    const admissionNumber =
      (typeof rest.admissionNumber === 'string' && rest.admissionNumber.trim()) ||
      `ADM-${rollNumber}`;

    return this.prisma.student.create({
      data: {
        ...rest,
        rollNumber,
        admissionNumber,
        parentName: String(rest.parentName).trim(),
        parentPhone: String(rest.parentPhone).trim(),
        address: String(rest.address).trim(),
        photoUrl,
      },
      include: { class: true, section: true, school: true },
    });
  }

  async findAll(query: {
    schoolId?: string; classId?: string; sectionId?: string;
    status?: string; search?: string; templateCode?: string;
    page?: number; limit?: number;
  }) {
    const { schoolId, classId, sectionId, status, search, templateCode, page = 1, limit = 20 } = query;
    const where: any = { deletedAt: null };

    if (schoolId) where.schoolId = schoolId;
    if (classId) where.classId = classId;
    if (sectionId) where.sectionId = sectionId;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { admissionNumber: { contains: search, mode: 'insensitive' } },
        { rollNumber: { contains: search, mode: 'insensitive' } },
        { parentPhone: { contains: search, mode: 'insensitive' } },
        { parentName: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (templateCode?.trim()) {
      const code = templateCode.trim();
      where.idCards = {
        some: {
          deletedAt: null,
          template: {
            OR: [
              { name: { contains: code, mode: 'insensitive' } },
              { code: { contains: code, mode: 'insensitive' } },
              { id: { equals: code } },
              { id: { startsWith: code, mode: 'insensitive' } },
            ],
          },
        },
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        include: {
          class: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
          school: { select: { id: true, name: true, code: true } },
          idCards: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              status: true,
              template: { select: { id: true, name: true, code: true } },
            },
          },
          _count: { select: { idCards: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.student.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: {
        class: true, section: true, school: true,
        idCards: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }

  async update(id: string, data: any) {
    await this.findOne(id);
    const {
      photo,
      dateOfBirth,
      bloodGroup,
      emergencyContact,
      transportDetails,
      parentName,
      parentPhone,
      address,
      firstName,
      lastName,
      rollNumber,
      schoolId,
      classId,
      sectionId,
      photoUrl,
      ...rest
    } = data;

    const payload: Record<string, unknown> = { ...rest };

    if (schoolId !== undefined) payload.schoolId = schoolId;
    if (classId !== undefined) payload.classId = classId;
    if (sectionId !== undefined) payload.sectionId = sectionId;
    if (firstName !== undefined) payload.firstName = String(firstName).trim();
    if (lastName !== undefined) payload.lastName = String(lastName).trim();
    if (rollNumber !== undefined) payload.rollNumber = String(rollNumber).trim();
    if (parentName !== undefined) payload.parentName = parentName ? String(parentName).trim() : null;
    if (parentPhone !== undefined) payload.parentPhone = parentPhone ? String(parentPhone).trim() : null;
    if (address !== undefined) payload.address = address ? String(address).trim() : null;
    if (bloodGroup !== undefined) payload.bloodGroup = bloodGroup ? String(bloodGroup).trim() : null;
    if (emergencyContact !== undefined) {
      payload.emergencyContact = emergencyContact ? String(emergencyContact).trim() : null;
    }
    if (transportDetails !== undefined) {
      payload.transportDetails = transportDetails ? String(transportDetails).trim() : null;
    }
    if (photoUrl !== undefined) payload.photoUrl = photoUrl;
    if (dateOfBirth !== undefined) {
      payload.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
    }

    return this.prisma.student.update({
      where: { id },
      data: payload,
      include: { class: true, section: true, school: true },
    });
  }

  async updateStatus(id: string, status: string, approvedBy?: string) {
    const updateData: any = { status };
    if (status === 'SUBMITTED') updateData.submittedAt = new Date();
    if (status === 'APPROVED') {
      updateData.approvedAt = new Date();
      updateData.approvedBy = approvedBy;
    }
    return this.prisma.student.update({ where: { id }, data: updateData });
  }

  async remove(id: string) {
    return this.prisma.student.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async bulkUpdateStatus(ids: string[], status: string, approvedBy?: string) {
    const updateData: any = { status };
    if (status === 'APPROVED') {
      updateData.approvedAt = new Date();
      updateData.approvedBy = approvedBy;
    }
    return this.prisma.student.updateMany({
      where: { id: { in: ids } },
      data: updateData,
    });
  }

  async getClassWiseStats(schoolId: string) {
    const classes = await this.prisma.class.findMany({
      where: { schoolId, deletedAt: null },
      include: {
        sections: { where: { deletedAt: null } },
        _count: { select: { students: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });
    return classes;
  }
}
