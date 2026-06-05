import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { ClassesService } from '../classes/classes.service';

@Injectable()
export class StudentsService {
  /** Stored per-class when no section is chosen; hidden in UI/cards. */
  private readonly internalNoSectionName = '—';

  constructor(
    private prisma: PrismaService,
    private uploadsService: UploadsService,
    private classesService: ClassesService,
  ) {}

  private async resolveStudentPlacement(
    schoolId: string,
    classId?: string | null,
    sectionId?: string | null,
  ): Promise<{ classId: string; sectionId: string }> {
    const cache = await this.classesService.buildClassSectionCache(schoolId);
    const cid = typeof classId === 'string' ? classId.trim() : '';
    const sid = typeof sectionId === 'string' ? sectionId.trim() : '';

    if (cid && sid) {
      return { classId: cid, sectionId: sid };
    }

    if (cid) {
      const cls = await this.prisma.class.findFirst({
        where: { id: cid, schoolId, deletedAt: null },
      });
      if (!cls) throw new BadRequestException('Class not found');
      const resolved = await this.classesService.findOrCreateClassSection(
        schoolId,
        cls.name,
        this.internalNoSectionName,
        cache,
      );
      return { classId: resolved.classId, sectionId: resolved.sectionId };
    }

    const resolved = await this.classesService.findOrCreateClassSection(
      schoolId,
      'Unassigned',
      'N/A',
      cache,
    );
    return { classId: resolved.classId, sectionId: resolved.sectionId };
  }

  async create(data: any, file?: Express.Multer.File) {
    const requiredFields = [
      'schoolId',
      'firstName',
      'rollNumber',
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

    let classId = typeof rest.classId === 'string' ? rest.classId.trim() : '';
    let sectionId = typeof rest.sectionId === 'string' ? rest.sectionId.trim() : '';
    const placement = await this.resolveStudentPlacement(String(rest.schoolId), classId || null, sectionId || null);
    classId = placement.classId;
    sectionId = placement.sectionId;

    const rollNumber = String(rest.rollNumber).trim();
    const parentPhone = String(rest.parentPhone).trim();
    if (!/^\d{10}$/.test(parentPhone)) {
      throw new BadRequestException('parentPhone must be exactly 10 digits');
    }
    const lastName = typeof rest.lastName === 'string' ? rest.lastName.trim() : '';
    const admissionNumber =
      (typeof rest.admissionNumber === 'string' && rest.admissionNumber.trim()) ||
      `ADM-${rollNumber}`;

    return this.prisma.student.create({
      data: {
        ...rest,
        classId,
        sectionId,
        rollNumber,
        admissionNumber,
        parentName: String(rest.parentName).trim(),
        parentPhone,
        address: String(rest.address).trim(),
        photoUrl,
        lastName: lastName || '',
      },
      include: { class: true, section: true, school: true },
    });
  }

  async findAll(query: {
    schoolId?: string; classId?: string; sectionId?: string;
    status?: string; search?: string; templateCode?: string;
    completion?: string;
    page?: number; limit?: number;
  }) {
    const { schoolId, classId, sectionId, status, completion, search, templateCode, page = 1, limit = 20 } = query;
    const where: any = { deletedAt: null };

    if (schoolId) where.schoolId = schoolId;
    if (classId) where.classId = classId;
    if (sectionId) where.sectionId = sectionId;
    if (status) where.status = status;
    if (completion === 'INCOMPLETE') {
      where.OR = [
        ...(where.OR ?? []),
        { photoUrl: null },
        { photoUrl: '' },
        { rollNumber: null },
        { rollNumber: '' },
        { parentName: null },
        { parentName: '' },
        { parentPhone: null },
        { parentPhone: '' },
      ];
    } else if (completion === 'COMPLETE') {
      where.photoUrl = { not: null };
      where.rollNumber = { not: null };
      where.parentName = { not: null };
      where.parentPhone = { not: null };
      where.NOT = [{ photoUrl: '' }, { rollNumber: '' }, { parentName: '' }, { parentPhone: '' }];
    }
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { admissionNumber: { contains: search, mode: 'insensitive' } },
        { rollNumber: { contains: search, mode: 'insensitive' } },
        { aadharCard: { contains: search, mode: 'insensitive' } },
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
          class: { select: { id: true, name: true, sortOrder: true } },
          section: { select: { id: true, name: true, sortOrder: true } },
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
        orderBy: [
          { class: { sortOrder: 'asc' } },
          { section: { sortOrder: 'asc' } },
          { rollNumber: 'asc' },
          { firstName: 'asc' },
          { lastName: 'asc' },
        ],
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

  async update(
    id: string,
    data: any,
    actor?: { role?: string; userId?: string },
    file?: Express.Multer.File,
  ) {
    const current = await this.findOne(id);
    if (current.status === 'APPROVED' && actor?.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Approved student records cannot be modified');
    }
    const {
      photo,
      dateOfBirth,
      bloodGroup,
      aadharCard,
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
    if (classId !== undefined) {
      const trimmed = String(classId).trim();
      payload.classId = trimmed ? trimmed : null;
    }
    if (sectionId !== undefined) {
      const trimmed = String(sectionId).trim();
      payload.sectionId = trimmed ? trimmed : null;
    }
    if (firstName !== undefined) payload.firstName = String(firstName).trim();
    if (lastName !== undefined) payload.lastName = String(lastName).trim();
    if (rollNumber !== undefined) {
      const trimmed = String(rollNumber).trim();
      payload.rollNumber = trimmed ? trimmed : null;
    }
    if (parentName !== undefined) payload.parentName = parentName ? String(parentName).trim() : null;
    if (parentPhone !== undefined) {
      const trimmed = parentPhone ? String(parentPhone).trim() : '';
      if (trimmed && !/^\d{10}$/.test(trimmed)) {
        throw new BadRequestException('parentPhone must be exactly 10 digits');
      }
      payload.parentPhone = trimmed || null;
    }
    if (address !== undefined) payload.address = address ? String(address).trim() : null;
    if (bloodGroup !== undefined) payload.bloodGroup = bloodGroup ? String(bloodGroup).trim() : null;
    if (aadharCard !== undefined) payload.aadharCard = aadharCard ? String(aadharCard).trim() : null;
    if (emergencyContact !== undefined) {
      payload.emergencyContact = emergencyContact ? String(emergencyContact).trim() : null;
    }
    if (transportDetails !== undefined) {
      payload.transportDetails = transportDetails ? String(transportDetails).trim() : null;
    }
    if (file) {
      payload.photoUrl = await this.uploadsService.saveFile(
        file,
        `schools/${current.schoolId}/students`,
      );
    } else if (photoUrl !== undefined) {
      payload.photoUrl = photoUrl;
    }
    if (dateOfBirth !== undefined) {
      payload.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
    }

    const classTouched = classId !== undefined;
    const sectionTouched = sectionId !== undefined;
    if (classTouched || sectionTouched) {
      const nextClassId = classTouched
        ? (String(classId).trim() || null)
        : current.classId;
      const nextSectionId = sectionTouched
        ? (String(sectionId).trim() || null)
        : current.sectionId;
      const placement = await this.resolveStudentPlacement(
        current.schoolId,
        nextClassId,
        nextSectionId,
      );
      payload.classId = placement.classId;
      payload.sectionId = placement.sectionId;
    }

    return this.prisma.student.update({
      where: { id },
      data: {
        ...payload,
        ...(typeof payload.lastName === 'string' && !payload.lastName.trim() ? { lastName: '' } : {}),
      },
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

  /** Deterministic admission id per class + section + roll (full UUIDs — no prefix collisions). */
  private buildImportAdmissionNumber(classId: string, sectionId: string, rollNumber: string): string {
    return `ADM-${classId}-${sectionId}-${rollNumber}`;
  }

  /** Previous import format (6-char UUID prefixes) — kept for lookup/migration only. */
  private buildLegacyTruncatedAdmissionNumber(
    classId: string,
    sectionId: string,
    rollNumber: string,
  ): string {
    return `ADM-${classId.slice(0, 6)}-${sectionId.slice(0, 6)}-${rollNumber}`;
  }

  private async findStudentForImport(
    schoolId: string,
    classId: string,
    sectionId: string,
    rollNumber: string,
    admissionNumber: string,
  ) {
    const legacyTruncated = this.buildLegacyTruncatedAdmissionNumber(classId, sectionId, rollNumber);
    const matchWhere = {
      schoolId,
      OR: [
        { admissionNumber },
        { admissionNumber: legacyTruncated },
        { classId, sectionId, rollNumber },
      ],
    };
    const active = await this.prisma.student.findFirst({
      where: { ...matchWhere, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    if (active) return active;
    return this.prisma.student.findFirst({
      where: matchWhere,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async bulkImport(
    schoolId: string,
    rows: {
      firstName: string;
      lastName: string;
      classId?: string;
      sectionId?: string;
      className?: string;
      sectionName?: string;
      parentName: string;
      address: string;
      rollNumber: string;
      parentPhone?: string;
    }[],
    actor?: { role?: string; schoolId?: string },
  ) {
    if (!schoolId?.trim()) {
      throw new BadRequestException('schoolId is required');
    }
    if (!rows?.length) {
      throw new BadRequestException('No students to import');
    }
    if (rows.length > 500) {
      throw new BadRequestException('Maximum 500 students per import');
    }

    if (actor?.role && actor.role !== 'SUPER_ADMIN' && actor.schoolId !== schoolId) {
      throw new BadRequestException('You can only import students for your school');
    }

    const classSectionCache = await this.classesService.buildClassSectionCache(schoolId);

    let created = 0;
    let updated = 0;
    let failed = 0;
    let classesCreated = 0;
    let sectionsCreated = 0;
    const results: { index: number; success: boolean; message?: string; updated?: boolean }[] = [];

    const reqString = (value: unknown, label: string): string => {
      if (typeof value !== 'string') {
        throw new BadRequestException(`${label} is required`);
      }
      const trimmed = value.trim();
      if (!trimmed) throw new BadRequestException(`${label} is required`);
      const lowered = trimmed.toLowerCase();
      if (lowered === 'undefined' || lowered === 'null') {
        throw new BadRequestException(`${label} is required`);
      }
      return trimmed;
    };

    const optId = (value: unknown): string => {
      if (value == null) return '';
      const trimmed = String(value).trim();
      const lowered = trimmed.toLowerCase();
      if (!trimmed || lowered === 'undefined' || lowered === 'null') return '';
      return trimmed;
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const rollNumber = reqString(row.rollNumber, 'Roll number');
        const firstName = reqString(row.firstName, 'First name');
        const lastName = reqString(row.lastName, 'Last name');
        const parentName = reqString(row.parentName, 'Father / parent name');
        const address = reqString(row.address, 'Address');

        const classIdFromRow = optId(row.classId);
        const sectionIdFromRow = optId(row.sectionId);

        let classId = classIdFromRow;
        let sectionId = sectionIdFromRow;
        let createdClass = false;
        let createdSection = false;

        // Backward-compatible: accept either {classId, sectionId} OR {className, sectionName}.
        if (!classId || !sectionId) {
          if (classId && !sectionId) {
            const placement = await this.resolveStudentPlacement(schoolId, classId, null);
            classId = placement.classId;
            sectionId = placement.sectionId;
          } else {
            const className = reqString(row.className, 'Class');
            const sectionName = typeof row.sectionName === 'string' ? row.sectionName.trim() : '';
            const resolved = await this.classesService.findOrCreateClassSection(
              schoolId,
              className,
              sectionName || this.internalNoSectionName,
              classSectionCache,
            );
            classId = resolved.classId;
            sectionId = resolved.sectionId;
            createdClass = resolved.createdClass;
            createdSection = resolved.createdSection;
          }
        }

        if (createdClass) classesCreated += 1;
        if (createdSection) sectionsCreated += 1;

        const admissionNumber = this.buildImportAdmissionNumber(classId, sectionId, rollNumber);
        const studentData = {
          classId,
          sectionId,
          firstName,
          lastName,
          rollNumber,
          parentName,
          parentPhone: row.parentPhone?.trim() || null,
          address,
          admissionNumber,
          deletedAt: null as Date | null,
        };

        const existing = await this.findStudentForImport(
          schoolId,
          classId,
          sectionId,
          rollNumber,
          admissionNumber,
        );

        const saveImportRow = async (targetId?: string) => {
          if (targetId) {
            await this.prisma.student.update({
              where: { id: targetId },
              data: studentData,
            });
            updated += 1;
            results.push({
              index: i,
              success: true,
              updated: true,
              message: `Updated existing student (roll ${rollNumber})`,
            });
            return;
          }
          await this.prisma.student.create({
            data: {
              schoolId,
              ...studentData,
              status: 'DRAFT',
            },
          });
          created += 1;
          results.push({ index: i, success: true });
        };

        if (existing) {
          await saveImportRow(existing.id);
        } else {
          try {
            await saveImportRow();
          } catch (createErr: unknown) {
            const isUnique =
              createErr &&
              typeof createErr === 'object' &&
              'code' in createErr &&
              (createErr as { code: string }).code === 'P2002';
            if (!isUnique) throw createErr;

            const conflict = await this.findStudentForImport(
              schoolId,
              classId,
              sectionId,
              rollNumber,
              admissionNumber,
            );
            if (!conflict) {
              throw createErr;
            }
            await saveImportRow(conflict.id);
          }
        }
      } catch (err: unknown) {
        failed += 1;
        let message = 'Import failed';
        if (err && typeof err === 'object') {
          if ('code' in err && (err as { code: string }).code === 'P2002') {
            message =
              'A deleted or conflicting student record exists for this class, section, and roll number. Remove the old record or use a different roll number.';
          } else if ('message' in err) {
            message = String((err as { message: string }).message);
          }
        }
        results.push({ index: i, success: false, message });
      }
    }

    return {
      created,
      updated,
      failed,
      total: rows.length,
      classesCreated,
      sectionsCreated,
      results,
    };
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
