import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeOrderStatusFilter, normalizeOrderStatusUpdate } from './order-status.util';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  async create(data: { schoolId: string; studentIds: string[]; notes?: string }) {
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;
    const order = await this.prisma.order.create({
      data: {
        schoolId: data.schoolId,
        orderNumber,
        totalCards: data.studentIds.length,
        notes: data.notes,
        idCards: {
          create: data.studentIds.map(studentId => ({
            studentId,
            status: 'PENDING',
          })),
        },
      },
      include: { idCards: { include: { student: true } }, school: true },
    });
    return order;
  }

  async findAll(query: { schoolId?: string; status?: string; page?: number; limit?: number }) {
    const { schoolId, status, page = 1, limit = 20 } = query;
    const where: any = { deletedAt: null };
    if (schoolId) where.schoolId = schoolId;
    if (status) {
      const normalized = normalizeOrderStatusFilter(status);
      if (!normalized) {
        throw new BadRequestException(
          `Invalid order status filter "${status}". Use DRAFT, SUBMITTED, APPROVED, PROCESSING, COMPLETED, or CANCELLED.`,
        );
      }
      where.status = normalized;
    }

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          school: { select: { id: true, name: true } },
          _count: { select: { idCards: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        school: true,
        idCards: { include: { student: { include: { class: true, section: true } } } },
        printBatches: true,
        deliveries: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async updateStatus(id: string, status: string, approvedBy?: string) {
    let normalized: ReturnType<typeof normalizeOrderStatusUpdate>;
    try {
      normalized = normalizeOrderStatusUpdate(status);
    } catch {
      throw new BadRequestException(
        `Invalid order status "${status}". Use DRAFT, SUBMITTED, APPROVED, PROCESSING, COMPLETED, or CANCELLED.`,
      );
    }
    const update: any = { status: normalized };
    if (normalized === 'SUBMITTED') update.submittedAt = new Date();
    if (normalized === 'APPROVED') {
      update.approvedAt = new Date();
      update.approvedBy = approvedBy;
    }
    return this.prisma.order.update({ where: { id }, data: update });
  }
}
